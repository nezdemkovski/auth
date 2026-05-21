import { parseProjects, type AuthProject } from "./projects";

export type Env = {
  port: number;
  publicBaseUrl: string;
  databaseUrl: string;
  betterAuthSecret: string;
  projects: AuthProject[];
};

const DEFAULT_PORT = 3000;
const MIN_SECRET_LENGTH = 32;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const port = Number(source.PORT ?? DEFAULT_PORT);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("PORT must be a positive integer");
  }

  const publicBaseUrl = required(source.AUTH_PUBLIC_BASE_URL, "AUTH_PUBLIC_BASE_URL");
  const databaseUrl = required(source.DATABASE_URL, "DATABASE_URL");
  const betterAuthSecret = required(source.BETTER_AUTH_SECRET, "BETTER_AUTH_SECRET");

  if (betterAuthSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(`BETTER_AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }

  return {
    port,
    publicBaseUrl: trimTrailingSlash(publicBaseUrl),
    databaseUrl,
    betterAuthSecret,
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
