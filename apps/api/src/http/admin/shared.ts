import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Hono } from "hono";
import type { Pool } from "pg";

import type { AuthRegistry, RegisteredProject } from "../../auth/registry";
import type { AuthProject } from "../../config/projects";
import type { EmailConfig } from "../../email/sender";
import { EmailProvider } from "../../email/sender";
import { MediaUploadError } from "../../storage/media";
import type { StorageService } from "../../services/core/storage";

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
  storageService: StorageService;
  getDeliverySettings(): EmailConfig;
  setDeliverySettings(settings: EmailConfig): void;
};

export type AdminRouteRegistration = (context: AdminRouteContext) => void;

export type ProjectUserRow = {
  id: string;
  email: string;
  name: string;
  role: string | null;
  banned: boolean | null;
  emailVerified: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  sessionCount: number;
};

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

export async function mustChangePassword(pool: Pool, userId: string): Promise<boolean> {
  const db = drizzle({ client: pool });
  const result = await db.execute<{ must_change_password: boolean }>(sql`
    SELECT must_change_password
    FROM auth_bootstrap_state
    WHERE key = 'initial_admin'
      AND user_id = ${userId}
    LIMIT 1
  `);

  return result.rows[0]?.must_change_password ?? false;
}

export async function updateAdminProfile(
  pool: Pool,
  userId: string,
  patch: { name?: string; email?: string }
): Promise<void> {
  const db = drizzle({ client: pool });

  if (patch.name !== undefined && patch.email !== undefined) {
    await db.execute(sql`
      UPDATE "user"
      SET name = ${patch.name},
          email = ${patch.email},
          "updatedAt" = now()
      WHERE id = ${userId}
    `);
    return;
  }
  if (patch.name !== undefined) {
    await db.execute(sql`
      UPDATE "user"
      SET name = ${patch.name},
          "updatedAt" = now()
      WHERE id = ${userId}
    `);
    return;
  }
  if (patch.email !== undefined) {
    await db.execute(sql`
      UPDATE "user"
      SET email = ${patch.email},
          "updatedAt" = now()
      WHERE id = ${userId}
    `);
  }
}

export async function markPasswordChanged(pool: Pool, userId: string): Promise<void> {
  const db = drizzle({ client: pool });

  await db.execute(sql`
    UPDATE auth_bootstrap_state
    SET must_change_password = false,
        changed_at = now()
    WHERE key = 'initial_admin'
      AND user_id = ${userId}
  `);
}

export async function readProjectCounts(pool: Pool): Promise<{
  userCount: number;
  activeSessionCount: number;
}> {
  const db = drizzle({ client: pool });
  const result = await db.execute<{
    userCount: string;
    activeSessionCount: string;
  }>(sql`
    SELECT (SELECT COUNT(*)::int FROM "user") AS "userCount",
           (SELECT COUNT(*)::int FROM "session" WHERE "expiresAt" > now()) AS "activeSessionCount"
  `);

  return {
    userCount: Number(result.rows[0]?.userCount ?? 0),
    activeSessionCount: Number(result.rows[0]?.activeSessionCount ?? 0)
  };
}

export async function readProjectUsers(pool: Pool): Promise<ProjectUserRow[]> {
  const db = drizzle({ client: pool });
  const result = await db.execute<ProjectUserRow>(sql`
    SELECT u.id,
           u.email,
           u.name,
           u.role,
           u.banned,
           u."emailVerified",
           u."createdAt",
           u."updatedAt",
           COUNT(s.id)::int AS "sessionCount"
    FROM "user" u
    LEFT JOIN "session" s ON s."userId" = u.id AND s."expiresAt" > now()
    GROUP BY u.id
    ORDER BY u."createdAt" DESC
    LIMIT 100
  `);

  return result.rows;
}

export async function terminateUserSessions(pool: Pool, userId: string): Promise<number> {
  const db = drizzle({ client: pool });
  const result = await db.execute<{ id: string }>(sql`
    DELETE FROM "session"
    WHERE "userId" = ${userId}
      AND "expiresAt" > now()
    RETURNING id
  `);

  return result.rows.length;
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

export function emailServiceEnabled(settings: EmailConfig): boolean {
  return settings.provider !== EmailProvider.None;
}
