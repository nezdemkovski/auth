import {
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata
} from "@better-auth/oauth-provider";
import type { Env, Hono } from "hono";
import { cors } from "hono/cors";

import { ADMIN_PROJECT_SLUG, type AuthProject } from "../../config/projects";
import { BillingProvider } from "../../config/projects";
import { auditLog } from "../../runtime/logger";

export type AuthProxyRegistry = {
  get(slug: string): AuthProxyRegisteredProject | null;
  isTrustedOrigin(slug: string, origin: string | undefined): boolean;
};

export type AuthProxyRegisteredProject = {
  project: AuthProject;
  auth: {
    handler(request: Request): Promise<Response>;
    api: {
      getAgentConfiguration(input: { headers: Headers }): Promise<unknown>;
      getOAuthServerConfig(input: unknown): unknown;
      getOpenIdConfig(input: unknown): unknown;
    };
  };
};

export const registerAuthProxyRoutes = <TEnv extends Env>(app: Hono<TEnv>, options: { registry: AuthProxyRegistry }) => {
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

    return c.json(
      await registered.auth.api.getAgentConfiguration({ headers: c.req.raw.headers })
    );
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

  app.on(["GET", "POST"], "/api/:project/auth/*", async (c) => {
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

    const response = await registered.auth.handler(c.req.raw);
    if (isSensitiveFailedAuthRequest(c.req.method, c.req.path, response.status)) {
      auditLog("auth.request.failed", {
        projectSlug: registered.project.slug,
        path: normalizeAuthPath(c.req.path, registered.project.slug),
        status: response.status
      });
    }
    return response;
  });
};

export const isEnabledAuthFeaturePath = (project: AuthProject, path: string) => {
  const authPath = path.replace(new RegExp(`^/api/${project.slug}/auth`), "") || "/";

  if (project.slug === ADMIN_PROJECT_SLUG && authPath.startsWith("/sign-up/")) {
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
};

const isAgentAuthPath = (path: string) => {
  return (
    path === "/agent-configuration" ||
    path.startsWith("/agent/") ||
    path.startsWith("/capability/") ||
    path.startsWith("/host/")
  );
};

const isOAuthProviderPath = (path: string) => {
  return (
    path === "/.well-known/oauth-authorization-server" ||
    path === "/.well-known/openid-configuration" ||
    path.startsWith("/oauth2/") ||
    path.startsWith("/admin/oauth2/")
  );
};

const isPolarPath = (path: string) => {
  return (
    path === "/checkout" ||
    path.startsWith("/customer/") ||
    path.startsWith("/usage/") ||
    path === "/polar/webhooks"
  );
};

const isPolarEnabled = (project: AuthProject) => {
  return (
    project.billing.provider === BillingProvider.Polar &&
    project.billing.enabled &&
    Boolean(project.billing.accessToken.trim())
  );
};

const isSensitiveFailedAuthRequest = (
  method: string,
  path: string,
  status: number
) => {
  if (method.toUpperCase() !== "POST" || status < 400) {
    return false;
  }

  return (
    path.includes("/sign-in/") ||
    path.includes("/sign-up/") ||
    path.includes("/reset-password") ||
    path.includes("/verify-email")
  );
};

const normalizeAuthPath = (path: string, projectSlug: string) => {
  return path.replace(new RegExp(`^/api/${projectSlug}/auth`), "/api/:project/auth");
};
