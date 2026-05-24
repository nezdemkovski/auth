import { Hono } from "hono";
import { cors } from "hono/cors";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata
} from "@better-auth/oauth-provider";
import type { Pool } from "pg";

import type { Env } from "../config/env";
import type { AuthProject } from "../config/projects";
import { AuthRegistry } from "../auth/registry";
import { bootstrapProjects, prepareProjectSchema } from "../db/bootstrap";
import { loadDeliverySettings } from "../db/delivery-settings";
import { loadEffectiveProjects } from "../db/project-settings";
import { createEmailSender } from "../email/sender";
import { createAdminApi } from "./admin";
import {
  createLoginSessionCode,
  createLoginCodeStore,
  exchangeLoginCode,
  getLoginConfig,
  getOAuthConsentConfig,
  getPasswordResetConfig
} from "./login";
import { createRateLimiter, rateLimit, securityHeaders } from "./security";
import { insertStorageObject } from "../db/storage-objects";
import { MediaUploadError, uploadMedia } from "../storage/media";

type AppVariables = {
  registry: AuthRegistry;
};

export async function createApp(env: Env) {
  const rateLimiter = createRateLimiter(env.redisUrl);
  const loginCodeStore = createLoginCodeStore(env.redisUrl);
  await rateLimiter.connect();
  await loginCodeStore.connect();
  let adminProject = env.adminProject;
  let projects: AuthProject[] = [];

  if (env.autoMigrate) {
    await bootstrapProjects({
      databaseUrl: env.databaseUrl,
      publicBaseUrl: env.publicBaseUrl,
      secret: env.betterAuthSecret,
      adminProject,
      adminEmail: env.adminEmail,
      initialDeliveryConfig: env.email
    });
  }

  const deliverySettings = await loadDeliverySettings({
    databaseUrl: env.databaseUrl,
    adminProject,
    encryptionSecret: env.betterAuthSecret
  });
  const emailSender = createEmailSender(deliverySettings);

  ({ adminProject, projects } = await loadEffectiveProjects({
    databaseUrl: env.databaseUrl,
    adminProject,
    encryptionSecret: env.betterAuthSecret
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

  app.get("/api/projects", (c) => {
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

  app.route(
    "/admin/api",
    createAdminApi({
      registry,
      deliverySettings,
      databaseUrl: env.databaseUrl,
      adminProject,
      publicBaseUrl: env.publicBaseUrl,
      secret: env.betterAuthSecret
    })
  );

  app.get("/api/:project/login/config/login", (c) =>
    getLoginConfig(c.req.raw, c.req.param("project"), { registry })
  );
  app.get("/api/:project/login/config/reset-password", (c) =>
    getPasswordResetConfig(c.req.raw, c.req.param("project"), { registry })
  );
  app.get("/api/:project/login/config/oauth-consent", (c) =>
    getOAuthConsentConfig(c.req.raw, c.req.param("project"), { registry })
  );

  app.post("/api/:project/login/token", (c) => {
    return exchangeLoginCode(c.req.raw, c.req.param("project"), {
      registry,
      secret: env.betterAuthSecret,
      codeStore: loginCodeStore
    });
  });

  app.post("/api/:project/login/session-code", (c) => {
    return createLoginSessionCode(c.req.raw, c.req.param("project"), {
      registry,
      secret: env.betterAuthSecret,
      trustProxyHeaders: env.trustProxyHeaders,
      codeStore: loginCodeStore
    });
  });

  app.use(
    "/api/:project/upload",
    cors({
      origin: (origin, c) => {
        const project = c.req.param("project");
        if (!project) {
          return "";
        }

        return registry.isTrustedOrigin(project, origin) ? origin : "";
      },
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["POST", "OPTIONS"],
      credentials: true,
      maxAge: 600
    })
  );

  app.post("/api/:project/upload", async (c) => {
    const projectSlug = c.req.param("project");
    const registered = registry.get(projectSlug);
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }

    const session = await getProjectSession(registered.auth, c.req.raw.headers);
    if (!session) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const form = await c.req.formData();
    const purpose = form.get("purpose");
    const file = form.get("file");
    if (purpose !== "user_avatar" || !(file instanceof File)) {
      return c.json({ error: "invalid_body" }, 400);
    }

    try {
      const uploaded = await uploadMedia({
        storage: registered.project.storage,
        realmSlug: registered.project.slug,
        purpose,
        file,
        ownerUserId: session.user.id
      });
      await insertStorageObject(registered.projectDb.pool, {
        purpose,
        ...uploaded,
        ownerUserId: session.user.id
      });
      await updateUserImage(registered.projectDb.pool, session.user.id, uploaded.publicUrl);

      return c.json({
        upload: uploaded,
        user: {
          id: session.user.id,
          image: uploaded.publicUrl
        }
      });
    } catch (error) {
      if (error instanceof MediaUploadError) {
        return c.json(
          { error: error.code },
          error.code === "storage_not_configured" ? 409 : 400
        );
      }
      throw error;
    }
  });

  app.get("/api/:project/.well-known/jwks.json", (c) => {
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

  app.get("/api/:project/.well-known/oauth-authorization-server", (c) => {
    const registered = registry.get(c.req.param("project"));
    if (!registered || !registered.project.features.oauthProvider.enabled) {
      return c.notFound();
    }

    return oauthProviderAuthServerMetadata(registered.auth)(c.req.raw);
  });

  app.get("/api/:project/.well-known/openid-configuration", (c) => {
    const registered = registry.get(c.req.param("project"));
    if (!registered || !registered.project.features.oauthProvider.enabled) {
      return c.notFound();
    }

    return oauthProviderOpenIdConfigMetadata(registered.auth)(c.req.raw);
  });

  app.get("/api/:project/.well-known/agent-configuration", async (c) => {
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
    "/api/:project/auth/*",
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

  app.on(["GET", "POST"], "/api/:project/auth/*", (c) => {
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
      await Promise.all([registry.close(), rateLimiter.close(), loginCodeStore.close()]);
    }
  };
}

async function getProjectSession(
  auth: unknown,
  headers: Headers
): Promise<{ user: { id: string } } | null> {
  const api = (auth as {
    api: {
      getSession(input: { headers: Headers }): Promise<{ user: { id: string } } | null>;
    };
  }).api;

  return api.getSession({ headers });
}

async function updateUserImage(
  pool: Pool,
  userId: string,
  image: string
): Promise<void> {
  const db = drizzle({ client: pool });
  await db.execute(sql`
    UPDATE "user"
    SET image = ${image},
        "updatedAt" = now()
    WHERE id = ${userId}
  `);
}

function isEnabledAuthFeaturePath(project: AuthProject, path: string): boolean {
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

export const __appTestUtils = {
  isEnabledAuthFeaturePath
};
