import {
  requestToResourceInput,
  verifyAccessTokenRequest,
  verifyBearerToken,
  type ResourceRequestInput
} from "better-auth/oauth2";

import {
  normalizeAuthConfiguration,
  type AuthConfiguration
} from "../shared/config.js";

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
  configuration: ReturnType<typeof normalizeAuthConfiguration>
): AuthIdentity => {
  const subject = claims.sub;
  const clientId = claims.client_id ?? claims.azp;
  const tokenKind = claims[configuration.tokenKindClaim];
  if (typeof subject !== "string" || !subject) {
    throw new AuthVerificationError("Access token has no subject");
  }
  if (clientId !== configuration.clientId) {
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
    clientId: configuration.clientId,
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

export const createAuthServer = (configuration: AuthConfiguration): AuthServer => {
  const normalized = normalizeAuthConfiguration(configuration);
  const verification = {
    jwksUrl: normalized.jwksUrl,
    verifyOptions: {
      issuer: normalized.issuer,
      audience: normalized.applicationResource
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
