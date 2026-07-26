import {
  requestToResourceInput,
  verifyAccessTokenRequest,
  verifyBearerToken,
  type ResourceRequestInput
} from "better-auth/oauth2";

import {
  normalizeAuthConfiguration
} from "../shared/config.js";

export type AuthServerConfiguration = {
  issuer: string;
  clientId?: string;
  resource?: string;
};

type NormalizedAuthServerConfiguration = {
  issuer: string;
  clientId?: string;
  resource: string;
  jwksUrl: string;
  tokenKindClaim: string;
};

export type AuthIdentity = {
  issuer: string;
  subject: string;
  clientId: string;
  scopes: string[];
  name?: string;
  email?: string;
  emailVerified?: boolean;
  image?: string;
  telegramId?: string;
};

export type AuthServer = {
  verifyToken(token: string): Promise<AuthIdentity>;
  verifyRequest(request: Request): Promise<AuthIdentity>;
  verifyRequest(input: ResourceRequestInput): Promise<AuthIdentity>;
};

export class AuthVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthVerificationError";
  }
}

type Claims = Record<string, unknown>;

export const identityFromClaims = (
  claims: Claims,
  configuration: NormalizedAuthServerConfiguration
): AuthIdentity => {
  const subject = claims.sub;
  const clientId = claims.client_id ?? claims.azp;
  const tokenKind = claims[configuration.tokenKindClaim];
  if (typeof subject !== "string" || !subject) {
    throw new AuthVerificationError("Access token has no subject");
  }
  if (typeof clientId !== "string" || !clientId) {
    throw new AuthVerificationError("Access token has no client id");
  }
  if (configuration.clientId && clientId !== configuration.clientId) {
    throw new AuthVerificationError("Access token belongs to another client");
  }
  if (tokenKind !== "user") {
    throw new AuthVerificationError("Expected a user access token");
  }

  const scope = claims.scope;
  const scopes = typeof scope === "string"
    ? scope.split(" ").filter(Boolean)
    : [];

  return {
    issuer: configuration.issuer,
    subject,
    clientId,
    scopes,
    ...(typeof claims.name === "string" ? { name: claims.name } : {}),
    ...(typeof claims.email === "string" ? { email: claims.email } : {}),
    ...(typeof claims.email_verified === "boolean"
      ? { emailVerified: claims.email_verified }
      : {}),
    ...(typeof claims.image === "string" ? { image: claims.image } : {}),
    ...(typeof claims.telegram_id === "string"
      ? { telegramId: claims.telegram_id }
      : {})
  };
};

const normalizeAuthServerConfiguration = (
  configuration: AuthServerConfiguration
): NormalizedAuthServerConfiguration => {
  const issuer = configuration.issuer.trim().replace(/\/+$/, "");
  const clientId = configuration.clientId?.trim();
  const resource = configuration.resource?.trim().replace(/\/+$/, "");
  if (!clientId && !resource) {
    throw new Error("AUTH_CLIENT_ID or an explicit resource is required");
  }
  if (!resource && clientId) {
    const normalized = normalizeAuthConfiguration({ issuer, clientId });
    return {
      issuer: normalized.issuer,
      clientId: normalized.clientId,
      resource: normalized.applicationResource,
      jwksUrl: normalized.jwksUrl,
      tokenKindClaim: normalized.tokenKindClaim
    };
  }
  const issuerUrl = new URL(issuer);
  new URL(resource ?? "");
  return {
    issuer,
    ...(clientId ? { clientId } : {}),
    resource: resource ?? "",
    jwksUrl: `${issuer}/auth/.well-known/jwks.json`,
    tokenKindClaim: `${issuerUrl.origin}/claims/token-kind`
  };
};

export const createAuthServer = (
  configuration: AuthServerConfiguration
): AuthServer => {
  const normalized = normalizeAuthServerConfiguration(configuration);
  const verification = {
    jwksUrl: normalized.jwksUrl,
    verifyOptions: {
      issuer: normalized.issuer,
      audience: normalized.resource
    }
  };

  return {
    verifyToken: async (token) => {
      const claims = await verifyBearerToken(token, verification);
      return identityFromClaims({ ...claims }, normalized);
    },
    verifyRequest: async (request) => {
      const input = request instanceof Request
        ? requestToResourceInput(request)
        : request;
      const claims = await verifyAccessTokenRequest(input, verification);
      return identityFromClaims({ ...claims }, normalized);
    }
  };
};

export const extractBearerToken = (authorization: string | null | undefined) => {
  if (!authorization) {
    return null;
  }
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  return match?.[1] ?? null;
};
