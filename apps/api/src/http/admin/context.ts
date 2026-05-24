import type { Hono } from "hono";

import type { AuthRegistry } from "../../auth/registry";
import type { AuthProject } from "../../config/projects";
import type { EmailConfig } from "../../email/sender";
import type { AdminAccountService } from "../../modules/admin-account/core";
import type { BillingService } from "../../modules/billing/core";
import type { DeliveryService } from "../../modules/delivery/core";
import type { ProjectService } from "../../modules/projects/core";
import type { StorageService } from "../../modules/storage/core";
import type { UsersService } from "../../modules/users/core";

export type AdminApiOptions = {
  registry: AuthRegistry;
  deliverySettings: EmailConfig;
  databaseUrl: string;
  adminProject: AuthProject;
  publicBaseUrl: string;
  secret: string;
  managedStorage: AuthProject["storage"];
};

export type AdminRouteContext = {
  app: Hono;
  options: AdminApiOptions;
  adminAccountService: AdminAccountService;
  billingService: BillingService;
  deliveryService: DeliveryService;
  projectService: ProjectService;
  storageService: StorageService;
  usersService: UsersService;
  getDeliverySettings(): EmailConfig;
  setDeliverySettings(settings: EmailConfig): void;
};

export type AdminRouteRegistration = (context: AdminRouteContext) => void;
