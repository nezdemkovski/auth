import type { Hono } from "hono";
import {
  OAuthResource,
  oauthResourceFailureResponse,
  oauthResourceScopes,
  readOAuthResourceMetadata,
  type OAuthResourceRegistry
} from "@nezdemkovski/auth-oauth-resource";

import type { AuthRegistry, RegisteredProject } from "../../auth/registry";
import { ErrorCode } from "../../runtime/error-codes";

type OAuthResourceVariables = {
  registry: AuthRegistry;
};

type OAuthResourceOptions = {
  resourceRegistry: OAuthResourceRegistry<RegisteredProject>;
  publicBaseUrl: string;
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
            registry: options.resourceRegistry,
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
