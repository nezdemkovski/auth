import { getMigrations } from "better-auth/db/migration";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import {
  AuthUserRole,
  createProjectDatabase
} from "@nezdemkovski/auth-better-auth-runtime";
import {
  ensureDeliverySettingsTable,
  seedDeliverySettingsFromEnv,
  type EmailConfig
} from "@nezdemkovski/auth-delivery";
import { ensureObservabilitySettingsTable } from "@nezdemkovski/auth-observability";
import {
  ensureStorageObjectsTable,
  ensureStorageSettingsTable
} from "@nezdemkovski/auth-storage";
import {
  ensureBillingTables
} from "@nezdemkovski/auth-billing";
import {
  ensureIdentityTables,
  ensureInitialAdminState,
  readIdentityUserByEmail,
  recordGeneratedInitialAdminState,
  updateIdentityUserRole
} from "@nezdemkovski/auth-identity";
import {
  ensureRealmTables,
  seedAdminRealmSettings
} from "@nezdemkovski/auth-realm";

import type { AuthProject } from "../config/projects";
import { randomBase64Url } from "../runtime/crypto";
import { logError } from "../runtime/logger";
import {
  createProjectAuth,
  createProjectMigrationAuthOptions
} from "../auth/project-auth";

type BootstrapOptions = {
  databaseUrl: string;
  publicBaseUrl: string;
  secret: string;
  encryptionSecret: string;
  adminProject: AuthProject;
  adminEmail: string;
  initialDeliveryConfig?: EmailConfig;
};

type ProjectSchemaOptions = Pick<
  BootstrapOptions,
  "databaseUrl" | "publicBaseUrl" | "secret"
> & {
  project: AuthProject;
};

const BOOTSTRAP_LOCK_KEY = "nezdemkovski-auth-bootstrap";

export const bootstrapProjects = async (options: BootstrapOptions) => {
  await withPostgresAdvisoryLock(options.databaseUrl, BOOTSTRAP_LOCK_KEY, async () => {
    await prepareProjectSchema({
      databaseUrl: options.databaseUrl,
      publicBaseUrl: options.publicBaseUrl,
      secret: options.secret,
      project: options.adminProject
    });

    await bootstrapInitialAdmin(options);
    await ensureRealmTables(options);
    await seedAdminRealmSettings({
      databaseUrl: options.databaseUrl,
      adminProject: options.adminProject,
      realm: options.adminProject
    });
    await ensureBillingTables({
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
  });
};

const bootstrapInitialAdmin = async (options: BootstrapOptions) => {
  const project = options.adminProject;
  const projectDb = createProjectDatabase(options.databaseUrl, project);
  const auth = createProjectAuth({
    project,
    projectDb,
    publicBaseUrl: options.publicBaseUrl,
    secret: options.secret,
    emailSender: null,
    trustProxyHeaders: false
  });

  try {
    await ensureIdentityTables(projectDb.pool);
    const existing = await readIdentityUserByEmail(
      projectDb.pool,
      options.adminEmail
    );

    if (existing) {
      const user = existing;
      if (user.role !== AuthUserRole.Admin) {
        await updateIdentityUserRole(
          projectDb.pool,
          user.id,
          AuthUserRole.Admin
        );
      }

      await ensureInitialAdminState(projectDb.pool, user.id);
      console.info(`[bootstrap] ${project.slug}: initial admin already exists`);
      return;
    }

    const temporaryPassword = generateTemporaryAdminPassword();
    const created = await auth.api.createUser({
      body: {
        email: options.adminEmail,
        name: "Initial Admin",
        password: temporaryPassword,
        role: AuthUserRole.Admin
      }
    });

    await recordGeneratedInitialAdminState(projectDb.pool, created.user.id);

    console.info(`[bootstrap] ${project.slug}: created initial admin ${options.adminEmail}`);
    console.info(`[bootstrap] ${project.slug}: temporary admin password: ${temporaryPassword}`);
    console.info(`[bootstrap] ${project.slug}: change this password after the first login`);
  } finally {
    await projectDb.pool.end();
  }
};

export const generateTemporaryAdminPassword = () => randomBase64Url(24);

export const prepareProjectSchema = async (options: ProjectSchemaOptions) => {
  await withPostgresAdvisoryLock(
    options.databaseUrl,
    `nezdemkovski-auth-schema:${options.project.schema}`,
    () => prepareProjectSchemaUnlocked(options)
  );
};

const prepareProjectSchemaUnlocked = async (options: ProjectSchemaOptions) => {
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

export const withPostgresAdvisoryLock = async <T>(
  databaseUrl: string,
  key: string,
  operation: () => Promise<T>
) => {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1
  });
  let client: PoolClient | null = null;
  let locked = false;

  try {
    client = await pool.connect();
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [key]);
    locked = true;
    return await operation();
  } finally {
    if (client && locked) {
      await client
        .query("SELECT pg_advisory_unlock(hashtext($1))", [key])
        .catch((error) => {
          logError("postgres_advisory_unlock_failed", {
            key,
            error: error instanceof Error ? error.message : String(error)
          });
        });
    }
    client?.release();
    await pool.end();
  }
};
