import { extname, join, normalize } from "node:path";

import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata
} from "@better-auth/oauth-provider";

import type { Env } from "../config/env";
import type { AuthProject } from "../config/projects";
import { AuthRegistry } from "../auth/registry";
import { bootstrapProjects, prepareProjectSchema } from "../db/bootstrap";
import { loadEffectiveProjects } from "../db/project-settings";
import { createEmailSender } from "../email/sender";
import { createAdminApi } from "./admin";
import {
  createHostedSessionCode,
  exchangeHostedCode,
  renderHostedLogin,
  submitHostedLogin
} from "./hosted";
import { createRateLimiter, rateLimit, securityHeaders } from "./security";

type AppVariables = {
  registry: AuthRegistry;
};

const HOSTED_ASSETS_DIR = join(
  import.meta.dir,
  "..",
  "..",
  "dist",
  "hosted-login"
);
const ADMIN_INDEX_PATH = join(HOSTED_ASSETS_DIR, "admin.html");

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2"
};

function hostedAssetPath(path: string): string | null {
  const relative = path.replace(/^\/hosted\//, "");
  const normalized = normalize(relative);
  if (normalized.startsWith("..") || normalized.startsWith("/")) {
    return null;
  }

  return join(HOSTED_ASSETS_DIR, normalized);
}

export async function createApp(env: Env) {
  const emailSender = createEmailSender(env.email);
  const rateLimiter = createRateLimiter(env.redisUrl);
  await rateLimiter.connect();
  let adminProject = env.adminProject;
  let projects: AuthProject[] = [];

  if (env.autoMigrate) {
    await bootstrapProjects({
      databaseUrl: env.databaseUrl,
      publicBaseUrl: env.publicBaseUrl,
      secret: env.betterAuthSecret,
      adminProject,
      adminEmail: env.adminEmail
    });
  }

  ({ adminProject, projects } = await loadEffectiveProjects({
    databaseUrl: env.databaseUrl,
    adminProject
  }));

  if (env.autoMigrate) {
    for (const project of projects) {
      await prepareProjectSchema({
        databaseUrl: env.databaseUrl,
        publicBaseUrl: env.publicBaseUrl,
        secret: env.betterAuthSecret,
        adminProject,
        project
      });
    }
  }

  const registry = new AuthRegistry({
    databaseUrl: env.databaseUrl,
    publicBaseUrl: env.publicBaseUrl,
    secret: env.betterAuthSecret,
    emailSender,
    trustProxyHeaders: env.trustProxyHeaders,
    projects: [adminProject, ...projects]
  });

  const app = new Hono<{ Variables: AppVariables }>({
    strict: false
  });

  app.use("*", async (c, next) => {
    c.set("registry", registry);
    await next();
  });
  app.use("*", securityHeaders(env.publicBaseUrl));
  app.use("*", rateLimit(rateLimiter, { trustProxyHeaders: env.trustProxyHeaders }));

  app.get("/healthz", (c) => {
    return c.json({
      ok: true
    });
  });

  app.get("/projects", (c) => {
    const publicProjects = registry
      .list()
      .filter((project) => project.slug !== adminProject.slug);

    return c.json({
      projects: publicProjects.map((project) => ({
        slug: project.slug,
        name: project.name
      }))
    });
  });

  app.get("/hosted/*", async (c) => {
    const assetPath = hostedAssetPath(c.req.path);
    if (!assetPath) {
      return c.notFound();
    }

    const file = Bun.file(assetPath);
    if (!(await file.exists())) {
      return c.notFound();
    }

    return new Response(file, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": CONTENT_TYPES[extname(assetPath)] ?? "application/octet-stream"
      }
    });
  });

  app.route(
    "/admin/api",
    createAdminApi({
      registry,
      emailServiceEnabled: env.emailServiceEnabled,
      databaseUrl: env.databaseUrl,
      adminProject,
      publicBaseUrl: env.publicBaseUrl,
      secret: env.betterAuthSecret
    })
  );

  app.get("/admin", renderAdminApp);
  app.get("/admin/*", renderAdminApp);

  app.get("/:project/login", (c) => {
    return renderHostedLogin(c.req.raw, c.req.param("project"), {
      registry,
      secret: env.betterAuthSecret
    });
  });

  app.post("/:project/login", (c) => {
    return submitHostedLogin(c.req.raw, c.req.param("project"), {
      registry,
      secret: env.betterAuthSecret,
      trustProxyHeaders: env.trustProxyHeaders
    });
  });

  app.post("/:project/hosted/token", (c) => {
    return exchangeHostedCode(c.req.raw, c.req.param("project"), {
      registry,
      secret: env.betterAuthSecret
    });
  });

  app.post("/:project/hosted/session-code", (c) => {
    return createHostedSessionCode(c.req.raw, c.req.param("project"), {
      registry,
      secret: env.betterAuthSecret,
      trustProxyHeaders: env.trustProxyHeaders
    });
  });

  app.get("/:project/.well-known/jwks.json", (c) => {
    const projectSlug = c.req.param("project");
    const registered = registry.get(projectSlug);

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

  app.get("/.well-known/oauth-authorization-server/:project", (c) => {
    const registered = registry.get(c.req.param("project"));
    if (!registered || !registered.project.features.oauthProvider.enabled) {
      return c.notFound();
    }

    return oauthProviderAuthServerMetadata(
      registered.auth as unknown as {
        api: { getOAuthServerConfig: (...args: unknown[]) => unknown };
      }
    )(c.req.raw);
  });

  app.get("/:project/.well-known/openid-configuration", (c) => {
    const registered = registry.get(c.req.param("project"));
    if (!registered || !registered.project.features.oauthProvider.enabled) {
      return c.notFound();
    }

    return oauthProviderOpenIdConfigMetadata(
      registered.auth as unknown as {
        api: { getOpenIdConfig: (...args: unknown[]) => unknown };
      }
    )(c.req.raw);
  });

  app.get("/:project/.well-known/agent-configuration", async (c) => {
    const projectSlug = c.req.param("project");
    const registered = registry.get(projectSlug);

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
    "/:project/api/auth/*",
    cors({
      origin: (origin, c) => {
        const project = c.req.param("project");
        if (!project) {
          return "";
        }

        return registry.isTrustedOrigin(project, origin) ? origin : "";
      },
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      credentials: true,
      maxAge: 600
    })
  );

  app.on(["GET", "POST"], "/:project/api/auth/*", (c) => {
    const projectSlug = c.req.param("project");
    const registered = registry.get(projectSlug);

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

  app.notFound((c) => {
    return c.json(
      {
        error: "not_found"
      },
      404
    );
  });

  return {
    app,
    registry,
    async close() {
      await Promise.all([registry.close(), rateLimiter.close()]);
    }
  };
}

function isEnabledAuthFeaturePath(project: AuthProject, path: string): boolean {
  const authPath = path.replace(new RegExp(`^/${project.slug}/api/auth`), "") || "/";

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

function renderAdminApp() {
  return new Response(Bun.file(ADMIN_INDEX_PATH), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
