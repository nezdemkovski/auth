import { getMigrations } from "better-auth/db/migration";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";

import { AuthUserRole, type AuthProject } from "../config/projects";
import type { EmailConfig } from "../email/sender";
import { randomBase64Url } from "../runtime/crypto";
import { logError } from "../runtime/logger";
import { authBootstrapState, authUsers } from "./auth-tables";
import {
  createProjectAuth,
  createProjectMigrationAuthOptions
} from "../auth/project-auth";
import { createProjectDatabase } from "./project-db";
import { ensureBillingSettingsTable } from "../modules/billing/store";
import { ensureBillingUsageTables } from "../modules/billing/usage-store";
import { ensureBillingWebhookTables } from "../modules/billing/webhook-store";
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
    await ensureBillingWebhookTables({
      databaseUrl: options.databaseUrl,
      adminProject: options.adminProject
    });
    await ensureBillingUsageTables({
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

    const [existing] = await db
      .select({
        id: authUsers.id,
        email: authUsers.email,
        role: authUsers.role
      })
      .from(authUsers)
      .where(sql`lower(${authUsers.email}) = lower(${options.adminEmail})`)
      .limit(1);

    if (existing) {
      const user = existing;
      if (user.role !== AuthUserRole.Admin) {
        await db
          .update(authUsers)
          .set({ role: AuthUserRole.Admin })
          .where(eq(authUsers.id, user.id));
      }

      await db
        .insert(authBootstrapState)
        .values({
          key: "initial_admin",
          userId: user.id,
          mustChangePassword: false
        })
        .onConflictDoNothing();
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

    await db
      .insert(authBootstrapState)
      .values({
        key: "initial_admin",
        userId: created.user.id,
        mustChangePassword: true
      })
      .onConflictDoUpdate({
        target: authBootstrapState.key,
        set: {
          userId: created.user.id,
          mustChangePassword: true,
          generatedAt: sql`now()`,
          changedAt: null
        }
      });

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
