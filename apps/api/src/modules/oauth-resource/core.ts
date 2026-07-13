import type { ResourceServerMetadata } from "@better-auth/oauth-provider";
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import {
  createDpopReplayStore,
  verifyAccessTokenRequest,
  type ResourceRequestInput
} from "better-auth/oauth2";

import type { AuthRegistry, RegisteredProject } from "../../auth/registry";
import {
  OAuthResource,
  type OAuthScope,
  oauthResourceIdentifier,
  oauthResourceScopes
} from "../../config/oauth-resources";
import { isRecord } from "../../runtime/type-guards";

export enum OAuthResourceErrorKind {
  UnknownProject = "unknown_project",
  InvalidToken = "invalid_token",
  InsufficientScope = "insufficient_scope"
}

export class OAuthResourceError extends Error {
  constructor(readonly kind: OAuthResourceErrorKind) {
    super(kind);
    this.name = "OAuthResourceError";
  }
}

export type UserOAuthResourceAccess = {
  registered: RegisteredProject;
  subject: string;
  clientId: string;
};

type OAuthResourceOptions = {
  registry: AuthRegistry;
  publicBaseUrl: string;
  projectSlug: string;
  resource: OAuthResource;
};

export const readOAuthResourceMetadata = async (
  options: OAuthResourceOptions
): Promise<ResourceServerMetadata> => {
  const registered = requireOAuthProject(options);
  const { getProtectedResourceMetadata } = oauthProviderResourceClient(
    registered.auth
  ).getActions();

  return getProtectedResourceMetadata({
    resource: oauthResourceIdentifier(
      options.publicBaseUrl,
      registered.project.slug,
      options.resource
    ),
    scopes_supported: oauthResourceScopes(options.resource)
  });
};

export const requireUserOAuthResource = async (
  options: OAuthResourceOptions & {
    request: ResourceRequestInput;
    scopes: OAuthScope[];
  }
): Promise<UserOAuthResourceAccess> => {
  const registered = requireOAuthProject(options);
  const identifier = oauthResourceIdentifier(
    options.publicBaseUrl,
    options.projectSlug,
    options.resource
  );

  try {
    const authContext = await registered.auth.$context;
    const claims = await verifyAccessTokenRequest(options.request, {
      jwksUrl: `${options.publicBaseUrl}/api/${options.projectSlug}/.well-known/jwks.json`,
      verifyOptions: {
        issuer: `${options.publicBaseUrl}/api/${options.projectSlug}`,
        audience: identifier
      },
      scopes: options.scopes,
      dpop: {
        replayStore: createDpopReplayStore(authContext.internalAdapter)
      }
    });

    if (
      typeof claims.sub !== "string" ||
      !claims.sub ||
      typeof claims.azp !== "string" ||
      !claims.azp
    ) {
      throw new OAuthResourceError(OAuthResourceErrorKind.InvalidToken);
    }

    return {
      registered,
      subject: claims.sub,
      clientId: claims.azp
    };
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

const requireOAuthProject = (options: {
  registry: AuthRegistry;
  projectSlug: string;
}) => {
  const registered = options.registry.get(options.projectSlug);
  if (!registered || !registered.project.features.oauthProvider.enabled) {
    throw new OAuthResourceError(OAuthResourceErrorKind.UnknownProject);
  }

  return registered;
};

const oauthVerifierStatus = (error: unknown) => {
  if (!isRecord(error) || typeof error.statusCode !== "number") {
    return null;
  }

  return error.statusCode;
};
