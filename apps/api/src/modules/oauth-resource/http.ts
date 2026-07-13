import type { Hono } from "hono";

import type { AuthRegistry } from "../../auth/registry";
import { OAuthResource, oauthResourceScopes } from "../../config/oauth-resources";
import { readOAuthResourceMetadata } from "./core";
import { oauthResourceFailureResponse } from "./translator";

type OAuthResourceVariables = {
  registry: AuthRegistry;
};

type OAuthResourceOptions = {
  registry: AuthRegistry;
  publicBaseUrl: string;
};

export const registerOAuthResourceRoutes = (
  app: Hono<{ Variables: OAuthResourceVariables }>,
  options: OAuthResourceOptions
) => {
  app.get(
    "/.well-known/oauth-protected-resource/api/:project/upload",
    async (c) => {
      const resource = OAuthResource.Storage;
      const projectSlug = c.req.param("project");
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
    }
  );
};
