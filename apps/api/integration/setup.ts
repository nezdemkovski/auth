import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { EmailProvider } from "@nezdemkovski/auth-delivery";
import {
  DEFAULT_PROJECT_STORAGE,
  StorageProvider
} from "@nezdemkovski/auth-storage";

import { ADMIN_PROJECT } from "../src/config/projects";
import type { OAuthScope } from "../src/config/oauth-resources";
import type { Env } from "../src/config/env";
import { bootstrapProjects } from "../src/db/bootstrap";
import { createApp } from "../src/http/app";
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

export const installIntegrationAppFetch = (
  app: Awaited<ReturnType<typeof createIntegrationApp>>["app"]
) => {
  const originalFetch = globalThis.fetch;
  const routedFetch = Object.assign(
    (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1]
    ) => {
      const request = new Request(input, init);
      if (new URL(request.url).origin !== integrationPublicBaseUrl) {
        return originalFetch(input, init);
      }

      const headers = new Headers(request.headers);
      headers.set(DIRECT_CLIENT_IP_HEADER, "127.0.0.1");
      return app.fetch(new Request(request, { headers }));
    },
    {
      preconnect: originalFetch.preconnect
    }
  );
  globalThis.fetch = routedFetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
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

export const createIntegrationUserResourceToken = async (options: {
  app: Awaited<ReturnType<typeof createIntegrationApp>>["app"];
  registry: Awaited<ReturnType<typeof createIntegrationApp>>["registry"];
  projectSlug: string;
  userCookie: string;
  resource: string;
  scopes: OAuthScope[];
}) => {
  const callbackUrl = "https://demo.example.com/oauth/callback";
  const scope = options.scopes.join(" ");
  const client = await createIntegrationResourceClient({
    ...options,
    ownerCookie: options.userCookie,
    profile: IntegrationResourceClientProfile.User,
    callbackUrl
  });
  if (!client.client_secret) {
    throw new Error("Expected a confidential OAuth client secret");
  }

  const codeVerifier =
    "integration-resource-code-verifier-with-more-than-forty-three-characters";
  const codeChallenge = Buffer.from(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(codeVerifier)
    )
  ).toString("base64url");
  const authorizeUrl = new URL(
    `/api/${options.projectSlug}/auth/oauth2/authorize`,
    integrationPublicBaseUrl
  );
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", client.client_id);
  authorizeUrl.searchParams.set("redirect_uri", callbackUrl);
  authorizeUrl.searchParams.set("scope", scope);
  authorizeUrl.searchParams.set("resource", options.resource);
  authorizeUrl.searchParams.set("state", "integration-resource-state");
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  const authorization = await options.app.request(authorizeUrl, {
    headers: {
      Cookie: options.userCookie,
      [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
    }
  });
  if (authorization.status !== 302) {
    throw new Error(
      `Expected resource authorization to redirect, got ${authorization.status}`
    );
  }

  const location = authorization.headers.get("location");
  if (!location) {
    throw new Error("Expected resource authorization callback location");
  }
  const code = new URL(location, callbackUrl).searchParams.get("code");
  if (!code) {
    throw new Error("Expected resource authorization code");
  }

  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl,
    client_id: client.client_id,
    code_verifier: codeVerifier,
    resource: options.resource
  });
  const tokenResponse = await options.app.request(
    `/api/${options.projectSlug}/auth/oauth2/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${client.client_id}:${client.client_secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
      },
      body: tokenBody.toString()
    }
  );
  const token = await readIntegrationJson(tokenResponse);
  if (tokenResponse.status !== 200 || typeof token.access_token !== "string") {
    throw new Error(
      `Expected resource token exchange to succeed, got ${tokenResponse.status}`
    );
  }

  return token.access_token;
};

export const createIntegrationServiceResourceToken = async (options: {
  app: Awaited<ReturnType<typeof createIntegrationApp>>["app"];
  registry: Awaited<ReturnType<typeof createIntegrationApp>>["registry"];
  projectSlug: string;
  ownerCookie: string;
  resource: string;
  scopes: OAuthScope[];
}) => {
  const scope = options.scopes.join(" ");
  const client = await createIntegrationResourceClient({
    ...options,
    profile: IntegrationResourceClientProfile.Service
  });
  if (!client.client_secret) {
    throw new Error("Expected a confidential service client secret");
  }

  const tokenResponse = await options.app.request(
    `/api/${options.projectSlug}/auth/oauth2/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${client.client_id}:${client.client_secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope,
        resource: options.resource
      }).toString()
    }
  );
  const token = await readIntegrationJson(tokenResponse);
  if (tokenResponse.status !== 200 || typeof token.access_token !== "string") {
    throw new Error(
      `Expected service token exchange to succeed, got ${tokenResponse.status}`
    );
  }

  return {
    accessToken: token.access_token,
    clientId: client.client_id
  };
};

enum IntegrationResourceClientProfile {
  User = "user",
  Service = "service"
}

const createIntegrationResourceClient = async (options: {
  registry: Awaited<ReturnType<typeof createIntegrationApp>>["registry"];
  projectSlug: string;
  ownerCookie: string;
  resource: string;
  scopes: OAuthScope[];
  profile: IntegrationResourceClientProfile;
  callbackUrl?: string;
}) => {
  const registered = options.registry.get(options.projectSlug);
  if (!registered) {
    throw new Error("Expected the OAuth realm to be registered");
  }

  const sessionHeaders = new Headers({ Cookie: options.ownerCookie });
  const client = await registered.auth.api.adminCreateOAuthClient({
    headers: sessionHeaders,
    body:
      options.profile === IntegrationResourceClientProfile.User
        ? {
            client_name: "Integration User Resource Client",
            redirect_uris: options.callbackUrl ? [options.callbackUrl] : [],
            token_endpoint_auth_method: "client_secret_basic",
            grant_types: ["authorization_code"],
            response_types: ["code"],
            scope: options.scopes.join(" "),
            type: "web",
            skip_consent: true,
            require_pkce: true
          }
        : {
            client_name: "Integration Service Resource Client",
            token_endpoint_auth_method: "client_secret_basic",
            grant_types: ["client_credentials"],
            scope: options.scopes.join(" "),
            skip_consent: true,
            require_pkce: false
          }
  });

  await registered.auth.api.adminLinkClientResource({
    headers: sessionHeaders,
    params: {
      identifier: options.resource,
      client_id: client.client_id
    }
  });

  return client;
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
