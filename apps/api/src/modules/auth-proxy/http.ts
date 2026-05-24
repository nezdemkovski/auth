import {
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata
} from "@better-auth/oauth-provider";
import type { Hono } from "hono";
import { cors } from "hono/cors";

import type { AuthRegistry } from "../../auth/registry";
import type { AuthProject } from "../../config/projects";

type AuthProxyVariables = {
  registry: AuthRegistry;
};

export function registerAuthProxyRoutes(
  app: Hono<{ Variables: AuthProxyVariables }>,
  options: { registry: AuthRegistry }
): void {
  app.get("/api/:project/.well-known/jwks.json", (c) => {
    const registered = options.registry.get(c.req.param("project"));

    if (!registered) {
      return c.json(
        {
          error: "unknown_project"
        },
        404
      );
    }

    return registered.auth.handler(c.req.raw);
  });

  app.get("/api/:project/.well-known/oauth-authorization-server", (c) => {
    const registered = options.registry.get(c.req.param("project"));
    if (!registered || !registered.project.features.oauthProvider.enabled) {
      return c.notFound();
    }

    return oauthProviderAuthServerMetadata(registered.auth)(c.req.raw);
  });

  app.get("/api/:project/.well-known/openid-configuration", (c) => {
    const registered = options.registry.get(c.req.param("project"));
    if (!registered || !registered.project.features.oauthProvider.enabled) {
      return c.notFound();
    }

    return oauthProviderOpenIdConfigMetadata(registered.auth)(c.req.raw);
  });

  app.get("/api/:project/.well-known/agent-configuration", async (c) => {
    const registered = options.registry.get(c.req.param("project"));

    if (!registered) {
      return c.json(
        {
          error: "unknown_project"
        },
        404
      );
    }

    if (!registered.project.features.agentAuth.enabled) {
      return c.notFound();
    }

    const api = registered.auth.api as unknown as {
      getAgentConfiguration(input: { headers: Headers }): Promise<unknown>;
    };
    return c.json(await api.getAgentConfiguration({ headers: c.req.raw.headers }));
  });

  app.use(
    "/api/:project/auth/*",
    cors({
      origin: (origin, c) => {
        const project = c.req.param("project");
        if (!project) {
          return "";
        }

        return options.registry.isTrustedOrigin(project, origin) ? origin : "";
      },
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      credentials: true,
      maxAge: 600
    })
  );

  app.on(["GET", "POST"], "/api/:project/auth/*", (c) => {
    const registered = options.registry.get(c.req.param("project"));

    if (!registered) {
      return c.json(
        {
          error: "unknown_project"
        },
        404
      );
    }

    if (!isEnabledAuthFeaturePath(registered.project, c.req.path)) {
      return c.notFound();
    }

    return registered.auth.handler(c.req.raw);
  });
}

export function isEnabledAuthFeaturePath(project: AuthProject, path: string): boolean {
  const authPath = path.replace(new RegExp(`^/api/${project.slug}/auth`), "") || "/";

  if (project.slug === "admin" && authPath.startsWith("/sign-up/")) {
    return false;
  }

  if (authPath.startsWith("/passkey/") && !project.features.passkey.enabled) {
    return false;
  }

  if (authPath.startsWith("/two-factor/") && !project.features.twoFactor.enabled) {
    return false;
  }

  if (isAgentAuthPath(authPath) && !project.features.agentAuth.enabled) {
    return false;
  }

  if (isOAuthProviderPath(authPath) && !project.features.oauthProvider.enabled) {
    return false;
  }

  if (isPolarPath(authPath) && !isPolarEnabled(project)) {
    return false;
  }

  return true;
}

function isAgentAuthPath(path: string): boolean {
  return (
    path === "/agent-configuration" ||
    path.startsWith("/agent/") ||
    path.startsWith("/capability/") ||
    path.startsWith("/host/")
  );
}

function isOAuthProviderPath(path: string): boolean {
  return (
    path === "/.well-known/oauth-authorization-server" ||
    path === "/.well-known/openid-configuration" ||
    path.startsWith("/oauth2/") ||
    path.startsWith("/admin/oauth2/")
  );
}

function isPolarPath(path: string): boolean {
  return (
    path === "/checkout" ||
    path.startsWith("/customer/") ||
    path.startsWith("/usage/") ||
    path === "/polar/webhooks"
  );
}

function isPolarEnabled(project: AuthProject): boolean {
  return (
    project.billing.provider === "polar" &&
    project.billing.enabled &&
    Boolean(project.billing.accessToken.trim())
  );
}

export const __authProxyTestUtils = {
  isEnabledAuthFeaturePath
};
