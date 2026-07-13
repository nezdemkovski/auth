import { Hono } from "hono";

import { registerLoginRoutes } from "../modules/login/http";
import { registerAuthProxyRoutes } from "../modules/auth-proxy/http";
import {
  createObservabilityReporter,
  inferObservabilityContext
} from "../modules/observability/core";
import { StorageService } from "../modules/storage/core";
import { registerPublicStorageRoutes } from "../modules/storage/public-http";
import type { Env } from "../config/env";
import type { AuthProject } from "../config/projects";
import { AuthRegistry } from "../auth/registry";
import { migrateDatabase } from "../db/migrate";
import { createAdminDatabase } from "../db/admin-pool";
import { registerBillingUsageRoutes } from "../modules/billing/usage-http";
import { createPolarEntitlementGrantStore } from "../modules/billing/usage-store";
import { createPolarWebhookStore } from "../modules/billing/webhook-store";
import { toRuntimeEmailConfig } from "../modules/delivery/translator";
import { readDeliverySettings } from "../modules/delivery/store";
import { loadEffectiveProjects } from "../modules/projects/store";
import { createEmailSender } from "../email/sender";
import { ErrorCode } from "../runtime/error-codes";
import { createAdminApi } from "./admin";
import { createRateLimiter, rateLimit, securityHeaders } from "./security";

type AppVariables = {
  registry: AuthRegistry;
};

export const createApp = async (env: Env) => {
  const rateLimiter = createRateLimiter(env.redisUrl);
  await rateLimiter.connect();
  let adminProject = env.adminProject;
  let projects: AuthProject[] = [];

  if (env.autoMigrate) {
    await migrateDatabase(env);
  }

  const adminDb = createAdminDatabase(env.databaseUrl, adminProject);
  const observabilityReporter = await createObservabilityReporter({
    databaseUrl: env.databaseUrl,
    adminProject,
    adminDb,
    encryptionSecret: env.secretEncryptionKey
  });
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

  const billingStoreOptions = {
    databaseUrl: env.databaseUrl,
    adminProject,
    adminDb
  };
  const polarWebhookStore = createPolarWebhookStore(billingStoreOptions);
  const registry = new AuthRegistry({
    databaseUrl: env.databaseUrl,
    publicBaseUrl: env.publicBaseUrl,
    secret: env.betterAuthSecret,
    emailSender,
    trustProxyHeaders: env.trustProxyHeaders,
    projects: [adminProject, ...projects],
    polarEntitlementGrantStore: createPolarEntitlementGrantStore(billingStoreOptions),
    polarWebhookStore
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

  app.get("/livez", (c) => {
    return c.json({
      ok: true
    });
  });

  app.get("/readyz", async (c) => {
    try {
      await Promise.all([
        adminDb.pool.query("SELECT 1"),
        rateLimiter.healthcheck()
      ]);
      return c.json({ ok: true });
    } catch {
      return c.json({ ok: false }, 503);
    }
  });

  app.get("/healthz", (c) => c.redirect("/readyz", 307));

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
      managedStorage: env.storage,
      observabilityReporter
    })
  );

  registerLoginRoutes(app, {
    registry,
    trustProxyHeaders: env.trustProxyHeaders,
    observabilityReporter
  });
  registerBillingUsageRoutes(app, {
    registry,
    ...billingStoreOptions
  });
  registerPublicStorageRoutes(app, { registry, storageService });
  registerAuthProxyRoutes(app, { registry });

  app.notFound((c) => {
    return c.json(
      {
        error: ErrorCode.NotFound
      },
      404
    );
  });

  app.onError((error, c) => {
    observabilityReporter.captureException(error, inferObservabilityContext(c.req.raw));
    return c.json(
      {
        error: ErrorCode.InternalServerError
      },
      500
    );
  });

  return {
    app,
    registry,
    async close() {
      await Promise.all([
        registry.close(),
        rateLimiter.close(),
        polarWebhookStore.close(),
        adminDb.pool.end()
      ]);
    }
  };
};
