import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { ADMIN_PROJECT, DEFAULT_PROJECT_STORAGE } from "../src/config/projects";
import { StorageProvider } from "../src/config/projects";
import type { Env } from "../src/config/env";
import { bootstrapProjects } from "../src/db/bootstrap";
import { createApp } from "../src/http/app";
import { EmailProvider } from "../src/email/sender";
import { DIRECT_CLIENT_IP_HEADER } from "../src/http/security";
import { isRecord } from "../src/runtime/type-guards";

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
export const integrationStorage = {
  provider: StorageProvider.S3,
  enabled: true,
  managed: true,
  endpoint: process.env.AUTH_INTEGRATION_STORAGE_ENDPOINT ?? "http://127.0.0.1:9002",
  region: "us-east-1",
  bucket: "auth-integration-public",
  publicBaseUrl: "http://127.0.0.1:9002/auth-integration-public",
  accessKeyId: "auth-integration-access-key",
  secretAccessKey: "auth-integration-secret-key"
};

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

export const signUpIntegrationUser = async (options: {
  app: Awaited<ReturnType<typeof createIntegrationApp>>["app"];
  projectSlug: string;
  origin: string;
  email: string;
  password: string;
  name?: string;
  expectSession?: boolean;
}) => {
  const response = await options.app.request(
    `/api/${options.projectSlug}/auth/sign-up/email`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: options.origin,
        [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
      },
      body: JSON.stringify({
        name: options.name ?? "Integration User",
        email: options.email,
        password: options.password
      })
    }
  );

  if (response.status !== 200) {
    throw new Error(`Expected sign-up to succeed, got ${response.status}`);
  }

  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  if (!cookie && options.expectSession !== false) {
    throw new Error("Expected sign-up to set a session cookie");
  }

  const body = await response.json();
  if (
    !isRecord(body) ||
    !isRecord(body.user) ||
    typeof body.user.id !== "string"
  ) {
    throw new Error("Expected sign-up response to include a user ID");
  }

  return {
    cookie,
    userId: body.user.id
  };
};

export const signInIntegrationUser = async (options: {
  app: Awaited<ReturnType<typeof createIntegrationApp>>["app"];
  projectSlug: string;
  origin: string;
  email: string;
  password: string;
}) => {
  const response = await options.app.request(
    `/api/${options.projectSlug}/auth/sign-in/email`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: options.origin,
        [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
      },
      body: JSON.stringify({
        email: options.email,
        password: options.password
      })
    }
  );

  if (response.status !== 200) {
    throw new Error(`Expected sign-in to succeed, got ${response.status}`);
  }

  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  if (!cookie) {
    throw new Error("Expected sign-in to set a session cookie");
  }

  return { cookie };
};

export const createIntegrationAdminSession = async (options: {
  app: Awaited<ReturnType<typeof createIntegrationApp>>["app"];
  registry: Awaited<ReturnType<typeof createIntegrationApp>>["registry"];
  email?: string;
  password?: string;
}) => {
  const email = options.email ?? "admin-session@integration.test";
  const password = options.password ?? "correct horse battery staple";
  const admin = options.registry.get(integrationAdminProject.slug);
  if (!admin) {
    throw new Error("Expected admin realm to be registered");
  }

  await admin.auth.api.createUser({
    body: {
      email,
      password,
      name: "Integration Admin",
      role: "admin"
    }
  });

  return signInIntegrationUser({
    app: options.app,
    projectSlug: integrationAdminProject.slug,
    origin: integrationPublicBaseUrl,
    email,
    password
  });
};

export const readIntegrationJson = async (response: Response) => {
  const body = await response.json();
  if (!isRecord(body)) {
    throw new Error("Expected JSON object response");
  }

  return body;
};
