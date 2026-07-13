import type { Hono } from "hono";
import type {
  DeliveryService,
  EmailConfig
} from "@nezdemkovski/auth-delivery";
import type {
  ObservabilityReporter,
  ObservabilityService
} from "@nezdemkovski/auth-observability";
import type { StorageService } from "@nezdemkovski/auth-storage";

import type { AuthRegistry } from "../../auth/registry";
import type { AuthProject } from "../../config/projects";
import type { AdminDatabase } from "../../db/admin-pool";
import type { AdminAccountService } from "../../modules/admin-account/core";
import type { BillingService } from "../../modules/billing/core";
import type { MediaService } from "../../modules/media/core";
import type { ProjectService } from "../../modules/projects/core";
import type { UsersService } from "../../modules/users/core";

export type AdminApiOptions = {
  registry: AuthRegistry;
  deliverySettings: EmailConfig;
  databaseUrl: string;
  adminProject: AuthProject;
  adminDb: AdminDatabase;
  publicBaseUrl: string;
  secret: string;
  encryptionSecret: string;
  managedStorage: AuthProject["storage"];
  observabilityReporter: ObservabilityReporter;
  mediaService: MediaService;
  storageService: StorageService;
};

export type AdminRouteContext = {
  app: Hono;
  options: AdminApiOptions;
  adminAccountService: AdminAccountService;
  billingService: BillingService;
  deliveryService: DeliveryService;
  observabilityService: ObservabilityService;
  mediaService: MediaService;
  projectService: ProjectService;
  storageService: StorageService;
  usersService: UsersService;
};

export type AdminRouteRegistration = (context: AdminRouteContext) => void;
