import type { Hono } from "hono";

import type { AuthRegistry, RegisteredProject } from "../../auth/registry";
import type { AuthProject } from "../../config/projects";
import type { EmailConfig } from "../../email/sender";
import { MediaUploadError } from "../../modules/storage/media";
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

export type AdminSession = {
  user: {
    id: string;
    email: string;
    name: string;
    role?: string | null;
  };
  session: {
    id: string;
  };
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

export type AdminRouteError = {
  error: "unknown_project" | "system_project_locked";
  status: 404 | 409;
};

export type AdminProjectLookup =
  | {
      registered: RegisteredProject;
      error?: never;
      status?: never;
    }
  | AdminRouteError;

export async function requireAdmin(
  registry: AuthRegistry,
  headers: Headers
): Promise<{ registered: RegisteredProject; session: AdminSession } | null> {
  const registered = registry.get("admin");
  if (!registered) {
    return null;
  }

  const session = await getSession(registered.auth, headers);
  if (!session || session.user.role !== "admin") {
    return null;
  }

  return {
    registered,
    session
  };
}

export async function getSession(
  auth: unknown,
  headers: Headers
): Promise<AdminSession | null> {
  const api = (auth as {
    api: {
      getSession(input: { headers: Headers }): Promise<AdminSession | null>;
    };
  }).api;

  return api.getSession({ headers });
}

export function requireRegisteredProject(
  options: AdminApiOptions,
  slug: string
): AdminProjectLookup {
  const registered = options.registry.get(slug);
  if (!registered) {
    return {
      error: "unknown_project",
      status: 404
    };
  }

  return { registered };
}

export function requireMutableProject(
  options: AdminApiOptions,
  slug: string
): AdminProjectLookup {
  const result = requireRegisteredProject(options, slug);
  if (result.error) {
    return result;
  }
  if (result.registered.project.slug === options.adminProject.slug) {
    return {
      error: "system_project_locked",
      status: 409
    };
  }

  return result;
}

export function mediaUploadError(error: unknown): Response {
  if (error instanceof MediaUploadError) {
    const status = error.code === "storage_not_configured" ? 409 : 400;
    return Response.json({ error: error.code }, { status });
  }

  throw error;
}

export function isStateChangingMethod(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

export function isTrustedAdminRequest(headers: Headers, adminOrigin: string): boolean {
  const origin = headers.get("origin");
  if (origin) {
    return origin === adminOrigin;
  }

  const secFetchSite = headers.get("sec-fetch-site");
  if (secFetchSite) {
    return secFetchSite === "same-origin";
  }

  return false;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
