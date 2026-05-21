import { getMigrations } from "better-auth/db/migration";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";

import type { AuthProject } from "../config/projects";
import {
  createProjectAuth,
  createProjectMigrationAuthOptions
} from "../auth/project-auth";
import { createProjectDatabase } from "./project-db";

type BootstrapOptions = {
  databaseUrl: string;
  publicBaseUrl: string;
  secret: string;
  adminProject: AuthProject;
  adminEmail: string;
  projects: AuthProject[];
};

const BOOTSTRAP_LOCK_KEY = "nezdemkovski-auth-bootstrap";

export async function bootstrapProjects(options: BootstrapOptions): Promise<void> {
  if (options.projects.length === 0) {
    return;
  }

  const adminPool = new Pool({
    connectionString: options.databaseUrl
  });
  const db = drizzle({
    client: adminPool
  });

  try {
    await db.execute(sql`SELECT pg_advisory_lock(hashtext(${BOOTSTRAP_LOCK_KEY}))`);

    for (const project of [options.adminProject, ...options.projects]) {
      await db.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(project.schema)}`);
      await migrateProject({
        ...options,
        project
      });
    }

    await bootstrapInitialAdmin(options);
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
    secret: options.secret
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

async function migrateProject(options: Omit<BootstrapOptions, "projects"> & {
  project: AuthProject;
}): Promise<void> {
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

    console.info(
      `[bootstrap] ${options.project.slug}: created ${migrations.toBeCreated.length} table(s), added ${migrations.toBeAdded.length} table change(s)`
    );
  } finally {
    await pool.end();
  }
}
