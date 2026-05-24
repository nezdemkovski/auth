import { getMigrations } from "better-auth/db/migration";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import type { AuthProject } from "../config/projects";
import type { EmailConfig } from "../email/sender";
import {
  createProjectAuth,
  createProjectMigrationAuthOptions
} from "../auth/project-auth";
import { createProjectDatabase } from "./project-db";
import {
  ensureDeliverySettingsTable,
  seedDeliverySettingsFromEnv
} from "./delivery-settings";
import { ensureProjectSettingsTable, seedAdminProjectSettings } from "./project-settings";
import { ensureSocialProviderSettingsTable } from "./social-provider-settings";
import {
  ensureStorageObjectsTable,
  ensureStorageSettingsTable
} from "../modules/storage/store";

type BootstrapOptions = {
  databaseUrl: string;
  publicBaseUrl: string;
  secret: string;
  adminProject: AuthProject;
  adminEmail: string;
  initialDeliveryConfig?: EmailConfig;
};

const BOOTSTRAP_LOCK_KEY = "nezdemkovski-auth-bootstrap";

export async function bootstrapProjects(options: BootstrapOptions): Promise<void> {
  const adminPool = new Pool({
    connectionString: options.databaseUrl
  });
  const db = drizzle({
    client: adminPool
  });

  try {
    await db.execute(sql`SELECT pg_advisory_lock(hashtext(${BOOTSTRAP_LOCK_KEY}))`);

    await prepareProjectSchema({
      ...options,
      project: options.adminProject
    });

    await bootstrapInitialAdmin(options);
    await ensureProjectSettingsTable(options.databaseUrl, options.adminProject);
    await seedAdminProjectSettings({
      databaseUrl: options.databaseUrl,
      adminProject: options.adminProject
    });
    await ensureSocialProviderSettingsTable({
      databaseUrl: options.databaseUrl,
      adminProject: options.adminProject
    });
    await ensureDeliverySettingsTable({
      databaseUrl: options.databaseUrl,
      adminProject: options.adminProject
    });
    await ensureStorageSettingsTable({
      databaseUrl: options.databaseUrl,
      adminProject: options.adminProject
    });
    if (options.initialDeliveryConfig) {
      await seedDeliverySettingsFromEnv({
        databaseUrl: options.databaseUrl,
        adminProject: options.adminProject,
        encryptionSecret: options.secret,
        email: options.initialDeliveryConfig
      });
    }
  } finally {
    await db
      .execute(sql`SELECT pg_advisory_unlock(hashtext(${BOOTSTRAP_LOCK_KEY}))`)
      .catch(() => {});
    await adminPool.end();
  }
}

async function bootstrapInitialAdmin(options: BootstrapOptions): Promise<void> {
  const project = options.adminProject;
  const projectDb = createProjectDatabase(options.databaseUrl, project);
  const db = drizzle({
    client: projectDb.pool
  });
  const auth = createProjectAuth({
    project,
    projectDb,
    publicBaseUrl: options.publicBaseUrl,
    secret: options.secret,
    emailSender: null,
    trustProxyHeaders: false
  });

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS auth_bootstrap_state (
        key text PRIMARY KEY,
        user_id text NOT NULL,
        must_change_password boolean NOT NULL DEFAULT true,
        generated_at timestamptz NOT NULL DEFAULT now(),
        changed_at timestamptz
      )
    `);

    const existing = await db.execute<{ id: string; email: string; role: string | null }>(sql`
      SELECT id, email, role
      FROM "user"
      WHERE lower(email) = lower(${options.adminEmail})
      LIMIT 1
    `);

    if (existing.rows.length > 0) {
      const user = existing.rows[0];
      if (user.role !== "admin") {
        await db.execute(sql`
          UPDATE "user"
          SET role = 'admin'
          WHERE id = ${user.id}
        `);
      }

      await db.execute(sql`
        INSERT INTO auth_bootstrap_state (key, user_id, must_change_password)
        VALUES ('initial_admin', ${user.id}, false)
        ON CONFLICT (key) DO NOTHING
      `);
      console.info(`[bootstrap] ${project.slug}: initial admin already exists`);
      return;
    }

    const temporaryPassword = generateTemporaryPassword();
    const created = await (auth.api as unknown as {
      createUser(input: {
        body: {
          email: string;
          name: string;
          password: string;
          role: string;
        };
      }): Promise<{ user: { id: string } }>;
    }).createUser({
      body: {
        email: options.adminEmail,
        name: "Initial Admin",
        password: temporaryPassword,
        role: "admin"
      }
    });

    await db.execute(sql`
      INSERT INTO auth_bootstrap_state (key, user_id, must_change_password)
      VALUES ('initial_admin', ${created.user.id}, true)
      ON CONFLICT (key) DO UPDATE
      SET user_id = EXCLUDED.user_id,
          must_change_password = true,
          generated_at = now(),
          changed_at = NULL
    `);

    console.info(`[bootstrap] ${project.slug}: created initial admin ${options.adminEmail}`);
    console.info(`[bootstrap] ${project.slug}: temporary admin password: ${temporaryPassword}`);
    console.info(`[bootstrap] ${project.slug}: change this password after the first login`);
  } finally {
    await projectDb.pool.end();
  }
}

function generateTemporaryPassword(): string {
  return randomBytes(24).toString("base64url");
}

export async function prepareProjectSchema(options: Omit<BootstrapOptions, "adminEmail" | "initialDeliveryConfig"> & {
  project: AuthProject;
}): Promise<void> {
  const adminPool = new Pool({
    connectionString: options.databaseUrl
  });

  try {
    const db = drizzle({ client: adminPool });
    await db.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(options.project.schema)}`);
  } finally {
    await adminPool.end();
  }

  const pool = new Pool({
    connectionString: options.databaseUrl,
    options: `-c search_path=${options.project.schema},public`
  });

  try {
    const migrations = await getMigrations(
      createProjectMigrationAuthOptions({
        project: options.project,
        pool,
        publicBaseUrl: options.publicBaseUrl,
        secret: options.secret
      })
    );

    if (migrations.toBeCreated.length === 0 && migrations.toBeAdded.length === 0) {
      console.info(`[bootstrap] ${options.project.slug}: schema is up to date`);
      return;
    }

    await migrations.runMigrations();
    await ensureStorageObjectsTable(pool);

    console.info(
      `[bootstrap] ${options.project.slug}: created ${migrations.toBeCreated.length} table(s), added ${migrations.toBeAdded.length} table change(s)`
    );
    return;
  } finally {
    await ensureStorageObjectsTable(pool).catch(() => {});
    await pool.end();
  }
}
