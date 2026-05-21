import { parseAdminProject, parseProjects, type AuthProject } from "./projects";

export type Env = {
  port: number;
  publicBaseUrl: string;
  databaseUrl: string;
  betterAuthSecret: string;
  autoMigrate: boolean;
  adminProject: AuthProject;
  adminEmail: string;
  email: EmailConfig;
  projects: AuthProject[];
};

export type EmailConfig =
  | {
      provider: "none";
    }
  | {
      provider: "cloudflare";
      accountId: string;
      apiToken: string;
      from: string;
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

  return {
    port,
    publicBaseUrl: trimTrailingSlash(publicBaseUrl),
    databaseUrl,
    betterAuthSecret,
    autoMigrate: parseBoolean(source.AUTH_AUTO_MIGRATE, true),
    adminProject: parseAdminProject(source.AUTH_ADMIN_PROJECT),
    adminEmail: source.AUTH_ADMIN_EMAIL ?? "admin@localhost",
    email: parseEmailConfig(source),
    projects: parseProjects(source.AUTH_PROJECTS)
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

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value.toLowerCase())) {
    return false;
  }

  throw new Error("AUTH_AUTO_MIGRATE must be a boolean");
}

function parseEmailConfig(source: NodeJS.ProcessEnv): EmailConfig {
  const provider = source.EMAIL_PROVIDER ?? "none";

  if (provider === "none") {
    return {
      provider: "none"
    };
  }

  if (provider !== "cloudflare") {
    throw new Error("EMAIL_PROVIDER must be one of: none, cloudflare");
  }

  return {
    provider: "cloudflare",
    accountId: required(source.CLOUDFLARE_ACCOUNT_ID, "CLOUDFLARE_ACCOUNT_ID"),
    apiToken: required(source.CLOUDFLARE_EMAIL_API_TOKEN, "CLOUDFLARE_EMAIL_API_TOKEN"),
    from: required(source.EMAIL_FROM, "EMAIL_FROM")
  };
}
