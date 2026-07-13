export type ReferenceProductConfig = {
  port: number;
  origin: string;
  secret: string;
  authIssuer: string;
  authClientId: string;
  authClientSecret: string;
};

const DEFAULT_PORT = 3010;
const MIN_SECRET_LENGTH = 32;

export const loadReferenceProductConfig = (
  source: NodeJS.ProcessEnv = process.env
): ReferenceProductConfig => {
  const port = Number(source.PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("PORT must be a positive integer");
  }

  const secret = required(source.BETTER_AUTH_SECRET, "BETTER_AUTH_SECRET");
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`BETTER_AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }

  return {
    port,
    origin: normalizeOrigin(source.APP_ORIGIN ?? `http://127.0.0.1:${port}`),
    secret,
    authIssuer: normalizeIssuer(required(source.AUTH_ISSUER, "AUTH_ISSUER")),
    authClientId: required(source.AUTH_CLIENT_ID, "AUTH_CLIENT_ID"),
    authClientSecret: required(source.AUTH_CLIENT_SECRET, "AUTH_CLIENT_SECRET")
  };
};

const required = (value: string | undefined, name: string) => {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    throw new Error(`${name} is required`);
  }

  return normalized;
};

const normalizeOrigin = (value: string) => {
  const url = new URL(value);
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("APP_ORIGIN must contain only scheme, host, and optional port");
  }

  return url.origin;
};

const normalizeIssuer = (value: string) => {
  const url = new URL(value);
  if (url.search || url.hash) {
    throw new Error("AUTH_ISSUER must not contain query or fragment");
  }

  return url.toString().replace(/\/$/, "");
};
