import type { GenericOAuthConfig } from "better-auth/plugins/generic-oauth";

import { normalizeIdentifier, requiredValue } from "../shared/identifier";

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
    discoveryUrl: `${issuer}/.well-known/openid-configuration`,
    clientId,
    clientSecret,
    authentication: "basic",
    scopes,
    pkce: true,
    ...(resource
      ? {
          authorizationUrlParams: { resource },
          tokenUrlParams: { resource }
        }
      : {})
  };
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
