import { Hono } from "hono";

import { registerLoginRoutes } from "../modules/login/http";
import { createLoginCodeStore } from "../modules/login/store";
import { registerAuthProxyRoutes } from "../modules/auth-proxy/http";
import { StorageService } from "../modules/storage/core";
import { registerPublicStorageRoutes } from "../modules/storage/public-http";
import type { Env } from "../config/env";
import type { AuthProject } from "../config/projects";
import { AuthRegistry } from "../auth/registry";
import { bootstrapProjects, prepareProjectSchema } from "../db/bootstrap";
import { createAdminDatabase } from "../db/admin-pool";
import { toRuntimeEmailConfig } from "../modules/delivery/translator";
import { readDeliverySettings } from "../modules/delivery/store";
import { loadEffectiveProjects } from "../modules/projects/store";
import { createEmailSender } from "../email/sender";
import { createAdminApi } from "./admin";
import { createRateLimiter, rateLimit, securityHeaders } from "./security";

type AppVariables = {
  registry: AuthRegistry;
};

export const createApp = async (env: Env) => {
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
      encryptionSecret: env.secretEncryptionKey,
      initialDeliveryConfig: env.email
    });
  }

  const adminDb = createAdminDatabase(env.databaseUrl, adminProject);
  const deliverySettings = await readDeliverySettings({
    databaseUrl: env.databaseUrl,
    adminProject,
    adminDb,
    encryptionSecret: env.secretEncryptionKey
  });
  const runtimeDeliverySettings = toRuntimeEmailConfig(deliverySettings);
  const emailSender = createEmailSender(runtimeDeliverySettings);

  ({ adminProject, projects } = await loadEffectiveProjects({
    databaseUrl: env.databaseUrl,
    adminProject,
    adminDb,
    encryptionSecret: env.secretEncryptionKey,
    managedStorage: env.storage
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
  const storageService = new StorageService({
    registry,
    databaseUrl: env.databaseUrl,
    adminProject,
    adminDb,
    encryptionSecret: env.secretEncryptionKey,
    managedStorage: env.storage
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

  app.route(
    "/admin/api",
    createAdminApi({
      registry,
      deliverySettings: runtimeDeliverySettings,
      databaseUrl: env.databaseUrl,
      adminProject,
      adminDb,
      publicBaseUrl: env.publicBaseUrl,
      secret: env.betterAuthSecret,
      encryptionSecret: env.secretEncryptionKey,
      managedStorage: env.storage
    })
  );

  registerLoginRoutes(app, {
    registry,
    secret: env.betterAuthSecret,
    trustProxyHeaders: env.trustProxyHeaders,
    codeStore: loginCodeStore
  });
  registerPublicStorageRoutes(app, { registry, storageService });
  registerAuthProxyRoutes(app, { registry });

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
      await Promise.all([
        registry.close(),
        rateLimiter.close(),
        loginCodeStore.close(),
        adminDb.pool.end()
      ]);
    }
  };
};
