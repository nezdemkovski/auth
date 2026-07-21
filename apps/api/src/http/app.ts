import { Hono } from "hono";
import {
  createObservabilityReporter
} from "@nezdemkovski/auth-observability";
import {
  createEmailSender,
  readDeliverySettings,
  toRuntimeEmailConfig
} from "@nezdemkovski/auth-delivery";
import {
  createS3StorageProvider,
  createStorageStore,
  StorageService
} from "@nezdemkovski/auth-storage";
import {
  createPolarEntitlementGrantStore,
  createPolarWebhookStore
} from "@nezdemkovski/auth-billing";
import { createOAuthResourceAuthorizer } from "@nezdemkovski/auth-oauth-resource";
import { updateRealmIconUrl } from "@nezdemkovski/auth-realm";
import {
  readIdentityUserImage,
  updateIdentityUserImage
} from "@nezdemkovski/auth-identity";

import { registerLoginRoutes } from "../modules/login/http";
import { registerAuthProxyRoutes } from "../modules/auth-proxy/http";
import { inferObservabilityContext } from "../modules/observability/http";
import { registerPublicStorageRoutes } from "../modules/storage/public-http";
import type { Env } from "../config/env";
import type { AuthProject } from "../config/projects";
import { AuthRegistry } from "../auth/registry";
import { createOAuthResourceRegistryPort } from "../auth/oauth-resource";
import { migrateDatabase } from "../db/migrate";
import { createAdminDatabase } from "../db/admin-pool";
import { registerBillingUsageRoutes } from "../modules/billing-usage/http";
import { registerBillingCustomerRoutes } from "../modules/billing-customer/http";
import { BillingCustomerService } from "../modules/billing-customer/core";
import { registerOAuthResourceRoutes } from "../modules/oauth-resource/http";
import { reconcileApplicationConnections } from "../modules/auth-connections/core";
import { createBillingAuthPluginContribution } from "../modules/billing/better-auth";
import { loadEffectiveProjects } from "../application/project-catalog";
import { MediaService } from "../modules/media/core";
import { ErrorCode } from "../runtime/error-codes";
import { logError } from "../runtime/logger";
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
    encryptionSecret: env.secretEncryptionKey,
    onSettingsLoadError: (error) => {
      logError("observability_settings_load_failed", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  const deliverySettings = await readDeliverySettings({
    databaseUrl: env.databaseUrl,
    adminProject,
    adminDb,
    encryptionSecret: env.secretEncryptionKey
  });
  const runtimeDeliverySettings = toRuntimeEmailConfig(deliverySettings);
  const emailSender = createEmailSender(runtimeDeliverySettings);

  const storageStore = createStorageStore({
    databaseUrl: env.databaseUrl,
    adminProject,
    adminDb,
    encryptionSecret: env.secretEncryptionKey,
    managedStorage: env.storage
  });

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
  const polarEntitlementGrantStore = createPolarEntitlementGrantStore(
    billingStoreOptions
  );
  const polarWebhookStore = createPolarWebhookStore(billingStoreOptions, {
    error: logError
  });
  const registry = new AuthRegistry({
    databaseUrl: env.databaseUrl,
    publicBaseUrl: env.publicBaseUrl,
    secret: env.betterAuthSecret,
    emailSender,
    trustProxyHeaders: env.trustProxyHeaders,
    projects: [adminProject, ...projects],
    pluginContributions: [
      createBillingAuthPluginContribution({
        entitlements: polarEntitlementGrantStore,
        webhooks: polarWebhookStore
      })
    ]
  });
  await registry.ready();
  await reconcileApplicationConnections(registry, env.publicBaseUrl);
  const oauthResourceRegistry = createOAuthResourceRegistryPort(registry);
  const oauthResourceAuthorizer = createOAuthResourceAuthorizer({
    registry: oauthResourceRegistry,
    publicBaseUrl: env.publicBaseUrl
  });
  const storageService = new StorageService({
    store: storageStore,
    provider: createS3StorageProvider(),
    managedStorage: env.storage,
    applyRuntimeSettings: (projectSlug, storage) =>
      registry.patchProject(projectSlug, { storage }),
    reportCleanupError: (event) => {
      logError(`storage_${event.type}`, {
        objectKey: event.objectKey,
        previousUrl: event.previousUrl,
        error: event.error instanceof Error ? event.error.message : String(event.error)
      });
    }
  });
  const mediaService = new MediaService({
    storage: storageService,
    realmIcons: {
      updateIcon: async (projectSlug, iconUrl) => {
        const project = await updateRealmIconUrl({
          databaseUrl: env.databaseUrl,
          adminProject,
          adminDb,
          slug: projectSlug,
          iconUrl
        });
        return Boolean(project);
      },
      applyRuntimeIcon: (projectSlug, iconUrl) =>
        registry.patchProject(projectSlug, { iconUrl })
    },
    userAvatars: {
      read: readIdentityUserImage,
      update: updateIdentityUserImage
    }
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
      observabilityReporter,
      mediaService,
      storageService
    })
  );

  registerLoginRoutes(app, {
    registry,
    trustProxyHeaders: env.trustProxyHeaders,
    observabilityReporter
  });
  registerBillingUsageRoutes(app, {
    registry,
    authorizer: oauthResourceAuthorizer,
    ...billingStoreOptions
  });
  registerBillingCustomerRoutes(app, {
    registry,
    authorizer: oauthResourceAuthorizer,
    service: new BillingCustomerService()
  });
  registerOAuthResourceRoutes(app, {
    resourceRegistry: oauthResourceRegistry,
    publicBaseUrl: env.publicBaseUrl
  });
  registerPublicStorageRoutes(app, {
    registry,
    authorizer: oauthResourceAuthorizer,
    mediaService
  });
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
