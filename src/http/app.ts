import { Hono } from "hono";
import { cors } from "hono/cors";

import type { Env } from "../config/env";
import { AuthRegistry } from "../auth/registry";
import { bootstrapProjects } from "../db/bootstrap";

type AppVariables = {
  registry: AuthRegistry;
};

export async function createApp(env: Env) {
  if (env.autoMigrate) {
    await bootstrapProjects({
      databaseUrl: env.databaseUrl,
      publicBaseUrl: env.publicBaseUrl,
      secret: env.betterAuthSecret,
      projects: env.projects
    });
  }

  const registry = new AuthRegistry({
    databaseUrl: env.databaseUrl,
    publicBaseUrl: env.publicBaseUrl,
    secret: env.betterAuthSecret,
    projects: env.projects
  });

  const app = new Hono<{ Variables: AppVariables }>({
    strict: false
  });

  app.use("*", async (c, next) => {
    c.set("registry", registry);
    await next();
  });

  app.get("/healthz", (c) => {
    return c.json({
      ok: true
    });
  });

  app.get("/projects", (c) => {
    return c.json({
      projects: registry.list().map((project) => ({
        slug: project.slug,
        name: project.name
      }))
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
    registry
  };
}
