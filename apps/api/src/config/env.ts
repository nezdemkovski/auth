import {
  ADMIN_PROJECT,
  DEFAULT_PROJECT_STORAGE,
  type AuthProject,
  type ProjectStorageSettings
} from "./projects";
import { EmailProvider, type EmailConfig } from "../email/sender";

export type Env = {
  port: number;
  publicBaseUrl: string;
  databaseUrl: string;
  betterAuthSecret: string;
  autoMigrate: boolean;
  adminProject: AuthProject;
  adminEmail: string;
  email: EmailConfig;
  storage: ProjectStorageSettings;
  redisUrl: string | null;
  trustProxyHeaders: boolean;
};

const DEFAULT_PORT = 3000;
const MIN_SECRET_LENGTH = 32;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const port = Number(source.PORT ?? DEFAULT_PORT);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("PORT must be a positive integer");
  }

  const publicBaseUrl = required(source.AUTH_PUBLIC_BASE_URL, "AUTH_PUBLIC_BASE_URL");
  const databaseUrl = source.DATABASE_URL ?? buildDatabaseUrl(source);
  const betterAuthSecret = required(source.BETTER_AUTH_SECRET, "BETTER_AUTH_SECRET");

  if (betterAuthSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(`BETTER_AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  const email = parseEmailConfig(source);
  const storage = parseStorageConfig(source);

  return {
    port,
    publicBaseUrl: trimTrailingSlash(publicBaseUrl),
    databaseUrl,
    betterAuthSecret,
    autoMigrate: parseBoolean(source.AUTH_AUTO_MIGRATE, true),
    adminProject: ADMIN_PROJECT,
    adminEmail: source.AUTH_ADMIN_EMAIL ?? "admin@localhost",
    email,
    storage,
    redisUrl: source.REDIS_URL?.trim() || null,
    trustProxyHeaders: parseBoolean(source.TRUST_PROXY_HEADERS, false, "TRUST_PROXY_HEADERS")
  };
}

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function buildDatabaseUrl(source: NodeJS.ProcessEnv): string {
  const host = required(source.POSTGRES_HOST, "POSTGRES_HOST");
  const port = source.POSTGRES_PORT ?? "5432";
  const database = required(source.POSTGRES_DB, "POSTGRES_DB");
  const user = required(source.POSTGRES_USER, "POSTGRES_USER");
  const password = required(source.POSTGRES_PASSWORD, "POSTGRES_PASSWORD");

  const url = new URL(`postgres://${host}:${port}/${database}`);
  url.username = user;
  url.password = password;

  return url.toString();
}

function parseBoolean(
  value: string | undefined,
  defaultValue: boolean,
  name = "AUTH_AUTO_MIGRATE"
): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value.toLowerCase())) {
    return false;
  }

  throw new Error(`${name} must be a boolean`);
}

function parseEmailConfig(source: NodeJS.ProcessEnv): EmailConfig {
  const provider = source.EMAIL_PROVIDER ?? EmailProvider.None;

  if (provider === EmailProvider.None) {
    return {
      provider: EmailProvider.None
    };
  }

  if (provider === EmailProvider.Cloudflare) {
    return {
      provider: EmailProvider.Cloudflare,
      accountId: required(source.CLOUDFLARE_ACCOUNT_ID, "CLOUDFLARE_ACCOUNT_ID"),
      apiToken: required(source.CLOUDFLARE_EMAIL_API_TOKEN, "CLOUDFLARE_EMAIL_API_TOKEN"),
      from: required(source.EMAIL_FROM, "EMAIL_FROM")
    };
  }

  if (provider === EmailProvider.Resend) {
    return {
      provider: EmailProvider.Resend,
      apiKey: required(source.RESEND_API_KEY, "RESEND_API_KEY"),
      from: required(source.EMAIL_FROM, "EMAIL_FROM")
    };
  }

  throw new Error("EMAIL_PROVIDER must be one of: none, cloudflare, resend");
}

function parseStorageConfig(source: NodeJS.ProcessEnv): ProjectStorageSettings {
  const provider = source.AUTH_STORAGE_PROVIDER ?? DEFAULT_PROJECT_STORAGE.provider;

  if (provider === "none") {
    return {
      ...DEFAULT_PROJECT_STORAGE
    };
  }

  if (provider !== "s3") {
    throw new Error("AUTH_STORAGE_PROVIDER must be one of: none, s3");
  }

  return {
    provider,
    enabled: false,
    managed: true,
    endpoint: required(source.AUTH_STORAGE_ENDPOINT, "AUTH_STORAGE_ENDPOINT"),
    region: source.AUTH_STORAGE_REGION?.trim() || "auto",
    bucket: required(source.AUTH_STORAGE_BUCKET, "AUTH_STORAGE_BUCKET"),
    publicBaseUrl: trimTrailingSlash(
      required(source.AUTH_STORAGE_PUBLIC_BASE_URL, "AUTH_STORAGE_PUBLIC_BASE_URL")
    ),
    accessKeyId: required(source.AUTH_STORAGE_ACCESS_KEY_ID, "AUTH_STORAGE_ACCESS_KEY_ID"),
    secretAccessKey: required(
      source.AUTH_STORAGE_SECRET_ACCESS_KEY,
      "AUTH_STORAGE_SECRET_ACCESS_KEY"
    )
  };
}
