import { Hono } from "hono";

import type { EmailConfig } from "../email/sender";
import { AdminAccountService } from "../modules/admin-account/core";
import { registerAdminAccountRoutes } from "../modules/admin-account/http";
import { BillingService } from "../modules/billing/core";
import { DeliveryService } from "../modules/delivery/core";
import { StorageService } from "../modules/storage/core";
import { registerBillingRoutes } from "../modules/billing/http";
import { registerDeliveryRoutes } from "../modules/delivery/http";
import { ProjectService } from "../modules/projects/core";
import { registerProjectRoutes } from "../modules/projects/http";
import { registerStorageRoutes } from "../modules/storage/http";
import { UsersService } from "../modules/users/core";
import { registerUserRoutes } from "../modules/users/http";
import {
  isStateChangingMethod,
  isTrustedAdminRequest,
  type AdminApiOptions
} from "./admin/shared";

export const createAdminApi = (options: AdminApiOptions) => {
  const app = new Hono();
  const adminOrigin = new URL(options.publicBaseUrl).origin;
  let currentDeliverySettings = options.deliverySettings;
  const billingService = new BillingService({
    registry: options.registry,
    databaseUrl: options.databaseUrl,
    adminProject: options.adminProject,
    adminDb: options.adminDb,
    publicBaseUrl: options.publicBaseUrl,
    encryptionSecret: options.encryptionSecret
  });
  const storageService = new StorageService({
    registry: options.registry,
    databaseUrl: options.databaseUrl,
    adminProject: options.adminProject,
    adminDb: options.adminDb,
    encryptionSecret: options.encryptionSecret,
    managedStorage: options.managedStorage
  });
  const deliveryService = new DeliveryService({
    registry: options.registry,
    databaseUrl: options.databaseUrl,
    adminProject: options.adminProject,
    adminDb: options.adminDb,
    encryptionSecret: options.encryptionSecret,
    setDeliverySettings: (settings: EmailConfig) => {
      currentDeliverySettings = settings;
    }
  });
  const adminAccountService = new AdminAccountService({
    publicBaseUrl: options.publicBaseUrl,
    getDeliverySettings: () => currentDeliverySettings
  });
  const projectService = new ProjectService({
    registry: options.registry,
    databaseUrl: options.databaseUrl,
    adminProject: options.adminProject,
    adminDb: options.adminDb,
    publicBaseUrl: options.publicBaseUrl,
    secret: options.secret,
    encryptionSecret: options.encryptionSecret
  });
  const usersService = new UsersService({
    adminProject: options.adminProject,
    getDeliverySettings: () => currentDeliverySettings
  });
  const routeContext = {
    app,
    options,
    adminAccountService,
    billingService,
    deliveryService,
    projectService,
    storageService,
    usersService,
    getDeliverySettings: () => currentDeliverySettings,
    setDeliverySettings: (settings: EmailConfig) => {
      currentDeliverySettings = settings;
    }
  };

  app.use("*", async (c, next) => {
    if (!isStateChangingMethod(c.req.method)) {
      await next();
      return;
    }

    if (!isTrustedAdminRequest(c.req.raw.headers, adminOrigin)) {
      return c.json({ error: "forbidden_origin" }, 403);
    }

    await next();
  });

  registerAdminAccountRoutes(routeContext);
  registerDeliveryRoutes(routeContext);

  registerProjectRoutes(routeContext);
  registerBillingRoutes(routeContext);
  registerStorageRoutes(routeContext);

  registerUserRoutes(routeContext);

  return app;
};
