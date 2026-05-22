import { extname, join, normalize } from "node:path";

import { Hono } from "hono";
import { cors } from "hono/cors";

import type { Env } from "../config/env";
import { AuthRegistry } from "../auth/registry";
import { bootstrapProjects } from "../db/bootstrap";
import { createEmailSender } from "../email/sender";
import { createAdminApi } from "./admin";
import {
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

  if (env.autoMigrate) {
    await bootstrapProjects({
      databaseUrl: env.databaseUrl,
      publicBaseUrl: env.publicBaseUrl,
      secret: env.betterAuthSecret,
      adminProject: env.adminProject,
      adminEmail: env.adminEmail,
      projects: env.projects
    });
  }

  const registry = new AuthRegistry({
    databaseUrl: env.databaseUrl,
    publicBaseUrl: env.publicBaseUrl,
    secret: env.betterAuthSecret,
    emailSender,
    projects: [env.adminProject, ...env.projects]
  });

  const app = new Hono<{ Variables: AppVariables }>({
    strict: false
  });

  app.use("*", async (c, next) => {
    c.set("registry", registry);
    await next();
  });
  app.use("*", securityHeaders(env.publicBaseUrl));
  app.use("*", rateLimit(rateLimiter));

  app.get("/healthz", (c) => {
    return c.json({
      ok: true
    });
  });

  app.get("/projects", (c) => {
    return c.json({
      projects: env.projects.map((project) => ({
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

  app.get("/admin", () => {
    return new Response(Bun.file(ADMIN_INDEX_PATH), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  });

  app.route(
    "/admin/api",
    createAdminApi({
      registry,
      emailServiceEnabled: env.emailServiceEnabled
    })
  );

  app.get("/:project/login", (c) => {
    return renderHostedLogin(c.req.raw, c.req.param("project"), {
      registry,
      secret: env.betterAuthSecret
    });
  });

  app.post("/:project/login", (c) => {
    return submitHostedLogin(c.req.raw, c.req.param("project"), {
      registry,
      secret: env.betterAuthSecret
    });
  });

  app.post("/:project/hosted/token", (c) => {
    return exchangeHostedCode(c.req.raw, c.req.param("project"), {
      registry,
      secret: env.betterAuthSecret
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
