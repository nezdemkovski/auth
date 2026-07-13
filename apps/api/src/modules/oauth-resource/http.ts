import type { Hono } from "hono";
import { requestToResourceInput } from "better-auth/oauth2";

import type { AuthRegistry } from "../../auth/registry";
import {
  OAuthResource,
  type OAuthScope,
  oauthResourceScopes
} from "../../config/oauth-resources";
import { ErrorCode } from "../../runtime/error-codes";
import {
  readOAuthResourceMetadata,
  requireServiceOAuthResource,
  requireUserOAuthResource,
  type ServiceOAuthResourceAccess,
  type UserOAuthResourceAccess
} from "./core";
import {
  oauthResourceFailureResponse,
  type OAuthResourceFailureResponse
} from "./translator";

type OAuthResourceVariables = {
  registry: AuthRegistry;
};

type OAuthResourceOptions = {
  registry: AuthRegistry;
  publicBaseUrl: string;
};

export type UserOAuthResourceAuthorization =
  | {
      ok: true;
      value: UserOAuthResourceAccess;
    }
  | {
      ok: false;
      failure: OAuthResourceFailureResponse;
    };

export type ServiceOAuthResourceAuthorization =
  | {
      ok: true;
      value: ServiceOAuthResourceAccess;
    }
  | {
      ok: false;
      failure: OAuthResourceFailureResponse;
    };

export const registerOAuthResourceRoutes = (
  app: Hono<{ Variables: OAuthResourceVariables }>,
  options: OAuthResourceOptions
) => {
  const metadataRoutes = [
    {
      path: "/.well-known/oauth-protected-resource/api/:project/upload",
      resource: OAuthResource.Storage
    },
    {
      path: "/.well-known/oauth-protected-resource/api/:project/billing",
      resource: OAuthResource.Billing
    }
  ];

  for (const metadataRoute of metadataRoutes) {
    app.get(metadataRoute.path, async (c) => {
      const resource = metadataRoute.resource;
      const projectSlug = c.req.param("project");
      if (!projectSlug) {
        return c.json({ error: ErrorCode.UnknownProject }, 404);
      }

      try {
        return c.json(
          await readOAuthResourceMetadata({
            registry: options.registry,
            publicBaseUrl: options.publicBaseUrl,
            projectSlug,
            resource
          })
        );
      } catch (error) {
        const failure = oauthResourceFailureResponse(error, {
          publicBaseUrl: options.publicBaseUrl,
          projectSlug,
          resource,
          scopes: oauthResourceScopes(resource)
        });
        if (!failure) {
          throw error;
        }

        return c.json({ error: failure.error }, failure.status);
      }
    });
  }
};

export const authorizeUserOAuthResourceRequest = async (options: {
  registry: AuthRegistry;
  publicBaseUrl: string;
  projectSlug: string;
  request: Request;
  resource: OAuthResource;
  scopes: OAuthScope[];
}): Promise<UserOAuthResourceAuthorization> => {
  try {
    return {
      ok: true,
      value: await requireUserOAuthResource({
        ...options,
        request: requestToResourceInput(options.request)
      })
    };
  } catch (error) {
    const failure = oauthResourceFailureResponse(error, options);
    if (!failure) {
      throw error;
    }

    return {
      ok: false,
      failure
    };
  }
};

export const authorizeServiceOAuthResourceRequest = async (options: {
  registry: AuthRegistry;
  publicBaseUrl: string;
  projectSlug: string;
  request: Request;
  resource: OAuthResource;
  scopes: OAuthScope[];
}): Promise<ServiceOAuthResourceAuthorization> => {
  try {
    return {
      ok: true,
      value: await requireServiceOAuthResource({
        ...options,
        request: requestToResourceInput(options.request)
      })
    };
  } catch (error) {
    const failure = oauthResourceFailureResponse(error, options);
    if (!failure) {
      throw error;
    }

    return {
      ok: false,
      failure
    };
  }
};
