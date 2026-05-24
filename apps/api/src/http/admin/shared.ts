import type { Hono } from "hono";

import type { AuthRegistry, RegisteredProject } from "../../auth/registry";
import type { AuthProject } from "../../config/projects";
import type { EmailConfig } from "../../email/sender";
import { MediaUploadError } from "../../modules/storage/media";
import type { BillingService } from "../../modules/billing/core";
import type { StorageService } from "../../modules/storage/core";

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
  billingService: BillingService;
  storageService: StorageService;
  getDeliverySettings(): EmailConfig;
  setDeliverySettings(settings: EmailConfig): void;
};

export type AdminRouteRegistration = (context: AdminRouteContext) => void;

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

export async function changePassword(
  auth: unknown,
  headers: Headers,
  body: {
    currentPassword: string;
    newPassword: string;
  }
): Promise<unknown> {
  const api = (auth as {
    api: {
      changePassword(input: {
        headers: Headers;
        body: {
          currentPassword: string;
          newPassword: string;
          revokeOtherSessions: boolean;
        };
      }): Promise<unknown>;
    };
  }).api;

  return api.changePassword({
    headers,
    body: {
      ...body,
      revokeOtherSessions: true
    }
  });
}

export async function verifyPassword(
  auth: unknown,
  headers: Headers,
  password: string
): Promise<boolean> {
  const api = (auth as {
    api: {
      verifyPassword(input: {
        headers: Headers;
        body: {
          password: string;
        };
      }): Promise<{ status: boolean }>;
    };
  }).api;

  const result = await api
    .verifyPassword({
      headers,
      body: {
        password
      }
    })
    .catch(() => null);

  return result?.status === true;
}

export async function changeEmail(
  auth: unknown,
  headers: Headers,
  body: {
    newEmail: string;
    callbackURL: string;
  }
): Promise<unknown> {
  const api = (auth as {
    api: {
      changeEmail(input: {
        headers: Headers;
        body: {
          newEmail: string;
          callbackURL: string;
        };
      }): Promise<unknown>;
    };
  }).api;

  return api.changeEmail({
    headers,
    body
  });
}

export async function sendVerificationEmail(
  auth: unknown,
  body: {
    email: string;
    callbackURL?: string;
  }
): Promise<unknown> {
  const api = (auth as {
    api: {
      sendVerificationEmail(input: {
        body: {
          email: string;
          callbackURL?: string;
        };
      }): Promise<unknown>;
    };
  }).api;

  return api.sendVerificationEmail({ body });
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

export function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
