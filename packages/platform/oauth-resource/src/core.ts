import type { ResourceServerMetadata } from "@better-auth/oauth-provider";
import type { ResourceRequestInput } from "better-auth/oauth2";

import {
  oauthResourceIdentifier,
  oauthResourceScopes,
  oauthTokenKindClaim
} from "./config";
import {
  OAuthResourceError,
  OAuthResourceErrorKind,
  OAuthTokenKind,
  type OAuthResource,
  type OAuthResourceRegistry,
  type OAuthScope,
  type ServiceOAuthResourceAccess,
  type UserOAuthResourceAccess
} from "./model";

type OAuthResourceOptions<TRegistered> = {
  registry: OAuthResourceRegistry<TRegistered>;
  publicBaseUrl: string;
  projectSlug: string;
  resource: OAuthResource;
};

export const readOAuthResourceMetadata = async <TRegistered>(
  options: OAuthResourceOptions<TRegistered>
): Promise<ResourceServerMetadata> => {
  const registration = requireOAuthProject(options);
  return registration.auth.getProtectedResourceMetadata({
    resource: oauthResourceIdentifier(
      options.publicBaseUrl,
      registration.projectSlug,
      options.resource
    ),
    scopes_supported: oauthResourceScopes(options.resource)
  });
};

export const requireUserOAuthResource = async <TRegistered>(
  options: OAuthResourceOptions<TRegistered> & {
    request: ResourceRequestInput;
    scopes: OAuthScope[];
  }
): Promise<UserOAuthResourceAccess<TRegistered>> => {
  const { registered, claims } = await verifyOAuthResource(options);
  const clientId = readClientId(claims);
  if (
    !clientId ||
    typeof claims.sub !== "string" ||
    !claims.sub ||
    claims.sub === clientId ||
    claims[oauthTokenKindClaim(options.publicBaseUrl)] !== OAuthTokenKind.User
  ) {
    throw new OAuthResourceError(OAuthResourceErrorKind.InvalidToken);
  }

  return {
    registered,
    subject: claims.sub,
    clientId
  };
};

export const requireServiceOAuthResource = async <TRegistered>(
  options: OAuthResourceOptions<TRegistered> & {
    request: ResourceRequestInput;
    scopes: OAuthScope[];
  }
): Promise<ServiceOAuthResourceAccess<TRegistered>> => {
  const { registered, claims } = await verifyOAuthResource(options);
  const clientId = readClientId(claims);
  if (
    !clientId ||
    claims.sub !== clientId ||
    claims[oauthTokenKindClaim(options.publicBaseUrl)] !== OAuthTokenKind.Service
  ) {
    throw new OAuthResourceError(OAuthResourceErrorKind.InvalidToken);
  }

  return {
    registered,
    clientId
  };
};

const verifyOAuthResource = async <TRegistered>(
  options: OAuthResourceOptions<TRegistered> & {
    request: ResourceRequestInput;
    scopes: OAuthScope[];
  }
) => {
  const registration = requireOAuthProject(options);
  const identifier = oauthResourceIdentifier(
    options.publicBaseUrl,
    options.projectSlug,
    options.resource
  );

  try {
    const claims = await registration.auth.verifyAccessTokenRequest(
      options.request,
      {
        jwksUrl: `${options.publicBaseUrl}/api/${options.projectSlug}/.well-known/jwks.json`,
        issuer: `${options.publicBaseUrl}/api/${options.projectSlug}`,
        audience: identifier,
        scopes: options.scopes
      }
    );

    return { registered: registration.registered, claims };
  } catch (error) {
    if (error instanceof OAuthResourceError) {
      throw error;
    }
    if (oauthVerifierStatus(error) === 403) {
      throw new OAuthResourceError(OAuthResourceErrorKind.InsufficientScope);
    }
    if (oauthVerifierStatus(error) === 401) {
      throw new OAuthResourceError(OAuthResourceErrorKind.InvalidToken);
    }

    throw error;
  }
};

const readClientId = (claims: Record<string, unknown>) => {
  if (
    typeof claims.azp !== "string" ||
    !claims.azp ||
    typeof claims.client_id !== "string" ||
    claims.client_id !== claims.azp
  ) {
    return null;
  }

  return claims.azp;
};

const requireOAuthProject = <TRegistered>(options: {
  registry: OAuthResourceRegistry<TRegistered>;
  projectSlug: string;
}) => {
  const registration = options.registry.get(options.projectSlug);
  if (!registration || !registration.oauthProviderEnabled) {
    throw new OAuthResourceError(OAuthResourceErrorKind.UnknownProject);
  }

  return registration;
};

const oauthVerifierStatus = (error: unknown) => {
  if (!isRecord(error) || typeof error.statusCode !== "number") {
    return null;
  }

  return error.statusCode;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
