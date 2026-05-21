import { getMigrations } from "better-auth/db/migration";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import type { AuthProject } from "../config/projects";
import { createProjectMigrationAuthOptions } from "../auth/project-auth";

type BootstrapOptions = {
  databaseUrl: string;
  publicBaseUrl: string;
  secret: string;
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

    for (const project of options.projects) {
      await db.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(project.schema)}`);
      await migrateProject({
        ...options,
        project
      });
    }
  } finally {
    await db
      .execute(sql`SELECT pg_advisory_unlock(hashtext(${BOOTSTRAP_LOCK_KEY}))`)
      .catch(() => {});
    await adminPool.end();
  }
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
