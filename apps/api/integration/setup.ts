import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { ADMIN_PROJECT, DEFAULT_PROJECT_STORAGE } from "../src/config/projects";
import type { Env } from "../src/config/env";
import { bootstrapProjects } from "../src/db/bootstrap";
import { createApp } from "../src/http/app";
import { EmailProvider } from "../src/email/sender";

export const integrationDatabaseUrl =
  process.env.AUTH_INTEGRATION_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://auth:auth@127.0.0.1:54330/auth_test";

export const integrationPublicBaseUrl = "http://127.0.0.1:3000";
export const integrationAdminEmail = "admin@integration.test";
export const integrationAuthSecret = "integration-better-auth-secret-for-test-suite";
export const integrationEncryptionSecret = "integration-encryption-secret-for-test-suite";
export const integrationRedisUrl =
  process.env.AUTH_INTEGRATION_REDIS_URL ??
  process.env.REDIS_URL ??
  "redis://127.0.0.1:63800";

export const integrationAdminProject = {
  ...ADMIN_PROJECT
};

export const integrationAdminDbOptions = {
  databaseUrl: integrationDatabaseUrl,
  adminProject: integrationAdminProject
};

export const resetIntegrationDatabase = async () => {
  const pool = new Pool({ connectionString: integrationDatabaseUrl });
  const db = drizzle({ client: pool });

  try {
    const schemas = await db.execute<{ schemaName: string }>(sql`
      SELECT schema_name AS "schemaName"
      FROM information_schema.schemata
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'public')
        AND schema_name NOT LIKE 'pg_%'
    `);

    for (const schema of schemas.rows) {
      await db.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier(schema.schemaName)} CASCADE`);
    }
  } finally {
    await pool.end();
  }
};

export const bootstrapIntegrationDatabase = async () => {
  await bootstrapProjects({
    databaseUrl: integrationDatabaseUrl,
    publicBaseUrl: integrationPublicBaseUrl,
    secret: integrationAuthSecret,
    encryptionSecret: integrationEncryptionSecret,
    adminProject: integrationAdminProject,
    adminEmail: integrationAdminEmail
  });
};

export const resetAndBootstrapIntegrationDatabase = async () => {
  await resetIntegrationDatabase();
  await bootstrapIntegrationDatabase();
};

export const createIntegrationEnv = (overrides: Partial<Env> = {}) => {
  const env: Env = {
    port: 3000,
    publicBaseUrl: integrationPublicBaseUrl,
    databaseUrl: integrationDatabaseUrl,
    betterAuthSecret: integrationAuthSecret,
    secretEncryptionKey: integrationEncryptionSecret,
    autoMigrate: true,
    adminProject: integrationAdminProject,
    adminEmail: integrationAdminEmail,
    email: {
      provider: EmailProvider.None
    },
    storage: DEFAULT_PROJECT_STORAGE,
    redisUrl: integrationRedisUrl,
    trustProxyHeaders: false,
    ...overrides
  };

  return env;
};

export const createIntegrationApp = async (overrides: Partial<Env> = {}) => {
  return createApp(createIntegrationEnv(overrides));
};
