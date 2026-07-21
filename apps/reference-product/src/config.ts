export type ReferenceProductConfig = {
  port: number;
  origin: string;
  authIssuer: string;
  authClientId: string;
};

const DEFAULT_PORT = 3010;

export const loadReferenceProductConfig = (
  source: NodeJS.ProcessEnv = process.env
): ReferenceProductConfig => {
  const port = Number(source.PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("PORT must be a positive integer");
  }

  return {
    port,
    origin: normalizeOrigin(source.APP_ORIGIN ?? `http://127.0.0.1:${port}`),
    authIssuer: normalizeIssuer(required(source.AUTH_ISSUER, "AUTH_ISSUER")),
    authClientId: required(source.AUTH_CLIENT_ID, "AUTH_CLIENT_ID")
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
