import type { EmailConfig } from "@nezdemkovski/auth-delivery";
import type { ObservabilityReporter } from "@nezdemkovski/auth-observability";
import type { StorageService } from "@nezdemkovski/auth-storage";

import type { AuthRegistry } from "../../auth/registry";
import type { AuthProject } from "../../config/projects";
import type { AdminDatabase } from "../../db/admin-pool";
import type { MediaService } from "../../modules/media/core";

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
