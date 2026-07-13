import type { GenericOAuthConfig } from "better-auth/plugins/generic-oauth";

export enum AuthPlatformScope {
  OpenId = "openid",
  Profile = "profile",
  Email = "email",
  OfflineAccess = "offline_access"
}

export const DEFAULT_AUTH_PLATFORM_SCOPES = [
  AuthPlatformScope.OpenId,
  AuthPlatformScope.Profile,
  AuthPlatformScope.Email,
  AuthPlatformScope.OfflineAccess
];

export type AuthPlatformProviderOptions = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  providerId?: string;
  name?: string;
  resource?: string;
  scopes?: string[];
};
export const createAuthPlatformProvider = (
  options: AuthPlatformProviderOptions
): GenericOAuthConfig => {
  const issuer = normalizeIdentifier(options.issuer, "issuer");
  const clientId = requiredValue(options.clientId, "clientId");
  const clientSecret = requiredValue(options.clientSecret, "clientSecret");
  const providerId = requiredValue(options.providerId ?? "auth-platform", "providerId");
  const scopes = normalizeScopes(options.scopes);
  const resource = options.resource
    ? normalizeIdentifier(options.resource, "resource")
    : null;

  return {
    providerId,
    name: options.name?.trim() || "Auth Platform",
    discoveryUrl: `${issuer}/.well-known/openid-configuration`,
    clientId,
    clientSecret,
    tokenEndpointAuth: {
      method: "client_secret_basic"
    },
    scopes,
    pkce: true,
    ...(resource
      ? {
          authorizationUrlParams: { resource },
          tokenUrlParams: { resource },
          refreshTokenParams: { resource }
        }
      : {})
  };
};

const requiredValue = (value: string, field: string) => {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${field} is required`);
  }

  return normalized;
};

const normalizeIdentifier = (value: string, field: string) => {
  const normalized = requiredValue(value, field).replace(/\/$/, "");

  try {
    const url = new URL(normalized);
    if (url.hash || url.search) {
      throw new Error();
    }
  } catch {
    throw new Error(`${field} must be an absolute URI without query or fragment`);
  }

  return normalized;
};

const normalizeScopes = (scopes: string[] | undefined) => {
  const normalized = (scopes ?? DEFAULT_AUTH_PLATFORM_SCOPES)
    .map((scope) => scope.trim())
    .filter(Boolean);
  const result = Array.from(new Set(normalized));

  if (!result.includes(AuthPlatformScope.OpenId)) {
    result.unshift(AuthPlatformScope.OpenId);
  }

  return result;
};
