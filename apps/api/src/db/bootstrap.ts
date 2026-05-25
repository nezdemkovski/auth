import { getMigrations } from "better-auth/db/migration";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import type { AuthProject } from "../config/projects";
import type { EmailConfig } from "../email/sender";
import { randomBase64Url } from "../runtime/crypto";
import { logError } from "../runtime/logger";
import {
  createProjectAuth,
  createProjectMigrationAuthOptions
} from "../auth/project-auth";
import { createProjectDatabase } from "./project-db";
import { ensureBillingSettingsTable } from "../modules/billing/store";
import {
  ensureDeliverySettingsTable,
  seedDeliverySettingsFromEnv
} from "../modules/delivery/store";
import {
  ensureProjectSettingsTable,
  seedAdminProjectSettings
} from "../modules/projects/store";
import { ensureObservabilitySettingsTable } from "../modules/observability/store";
import { ensureSocialProviderSettingsTable } from "../modules/projects/social-provider-store";
import { ensureStorageObjectsTable } from "../modules/storage/objects-store";
import { ensureStorageSettingsTable } from "../modules/storage/settings-store";

type BootstrapOptions = {
  databaseUrl: string;
  publicBaseUrl: string;
  secret: string;
  encryptionSecret: string;
  adminProject: AuthProject;
  adminEmail: string;
  initialDeliveryConfig?: EmailConfig;
};

const BOOTSTRAP_LOCK_KEY = "nezdemkovski-auth-bootstrap";

export const bootstrapProjects = async (options: BootstrapOptions) => {
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
    await ensureProjectSettingsTable(options);
    await seedAdminProjectSettings({
      databaseUrl: options.databaseUrl,
      adminProject: options.adminProject
    });
    await ensureSocialProviderSettingsTable({
      databaseUrl: options.databaseUrl,
      adminProject: options.adminProject
    });
    await ensureBillingSettingsTable({
      databaseUrl: options.databaseUrl,
      adminProject: options.adminProject
    });
    await ensureDeliverySettingsTable({
      databaseUrl: options.databaseUrl,
      adminProject: options.adminProject
    });
    await ensureObservabilitySettingsTable({
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
        encryptionSecret: options.encryptionSecret,
        email: options.initialDeliveryConfig
      });
    }
  } finally {
    await db
      .execute(sql`SELECT pg_advisory_unlock(hashtext(${BOOTSTRAP_LOCK_KEY}))`)
      .catch((error) => {
        logError("bootstrap_advisory_unlock_failed", {
          error: error instanceof Error ? error.message : String(error)
        });
      });
    await adminPool.end();
  }
};

const bootstrapInitialAdmin = async (options: BootstrapOptions) => {
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
    const created = await auth.api.createUser({
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
};

const generateTemporaryPassword = () => {
  return randomBase64Url(24);
};

export const prepareProjectSchema = async (options: Omit<BootstrapOptions, "adminEmail" | "initialDeliveryConfig" | "encryptionSecret"> & {
  project: AuthProject;
}) => {
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
    options: `-c search_path="${options.project.schema}",public`
  });

  try {
    const migrations = await getMigrations(
      createProjectMigrationAuthOptions({
        project: options.project,
        database: pool,
        publicBaseUrl: options.publicBaseUrl,
        secret: options.secret
      })
    );
    await ensureStorageObjectsTable(pool);

    if (migrations.toBeCreated.length === 0 && migrations.toBeAdded.length === 0) {
      console.info(`[bootstrap] ${options.project.slug}: schema is up to date`);
      return;
    }

    await migrations.runMigrations();

    console.info(
      `[bootstrap] ${options.project.slug}: created ${migrations.toBeCreated.length} table(s), added ${migrations.toBeAdded.length} table change(s)`
    );
    return;
  } finally {
    await pool.end();
  }
};
