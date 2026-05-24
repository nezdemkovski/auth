import { Hono } from "hono";

import { EmailProvider, type EmailConfig } from "../email/sender";
import {
  markPasswordChanged,
  mustChangePassword,
  updateAdminProfile
} from "../services/core/admin-account";
import { BillingService } from "../services/core/billing";
import { StorageService } from "../services/core/storage";
import { registerBillingRoutes } from "./admin/routes/billing";
import { registerDeliveryRoutes } from "./admin/routes/delivery";
import { registerProjectRoutes } from "./admin/routes/projects";
import { registerStorageRoutes } from "./admin/routes/storage";
import { registerUserRoutes } from "./admin/routes/users";
import {
  changeEmail,
  changePassword,
  getSession,
  isStateChangingMethod,
  isTrustedAdminRequest,
  verifyPassword,
  type AdminApiOptions
} from "./admin/shared";
import {
  getProfileCurrentPassword,
  parseAdminProfilePatch,
  parseChangePasswordInput
} from "./validator/admin-account";

export function createAdminApi(options: AdminApiOptions): Hono {
  const app = new Hono();
  const adminOrigin = new URL(options.publicBaseUrl).origin;
  let currentDeliverySettings = options.deliverySettings;
  const billingService = new BillingService({
    registry: options.registry,
    databaseUrl: options.databaseUrl,
    adminProject: options.adminProject,
    publicBaseUrl: options.publicBaseUrl,
    encryptionSecret: options.secret
  });
  const storageService = new StorageService({
    registry: options.registry,
    databaseUrl: options.databaseUrl,
    adminProject: options.adminProject,
    encryptionSecret: options.secret,
    managedStorage: options.managedStorage
  });
  const routeContext = {
    app,
    options,
    billingService,
    storageService,
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

  app.get("/me", async (c) => {
    const admin = options.registry.get("admin");
    if (!admin) {
      return c.json({ error: "admin_not_configured" }, 500);
    }

    const session = await getSession(admin.auth, c.req.raw.headers);
    if (!session) {
      return c.json({ error: "unauthorized" }, 401);
    }

    return c.json({
      user: session.user,
      mustChangePassword: await mustChangePassword(admin.projectDb.pool, session.user.id),
      emailServiceEnabled: currentDeliverySettings.provider !== EmailProvider.None
    });
  });

  registerDeliveryRoutes(routeContext);

  app.patch("/profile", async (c) => {
    const admin = options.registry.get("admin");
    if (!admin) {
      return c.json({ error: "admin_not_configured" }, 500);
    }

    const session = await getSession(admin.auth, c.req.raw.headers);
    if (!session) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const body = await c.req.json().catch(() => ({}));
    const patch = parseAdminProfilePatch(body);
    if (!patch) {
      return c.json({ error: "invalid_body" }, 400);
    }

    try {
      if (patch.email !== undefined && patch.email !== session.user.email.toLowerCase()) {
        if (currentDeliverySettings.provider === EmailProvider.None) {
          return c.json({ error: "email_service_disabled" }, 409);
        }
        const currentPassword = getProfileCurrentPassword(body);
        if (!currentPassword) {
          return c.json({ error: "current_password_required" }, 400);
        }
        if (!(await verifyPassword(admin.auth, c.req.raw.headers, currentPassword))) {
          return c.json({ error: "invalid_password" }, 401);
        }
      }

      await updateAdminProfile(admin.projectDb.pool, session.user.id, {
        name: patch.name
      });

      if (patch.email !== undefined && patch.email !== session.user.email.toLowerCase()) {
        await changeEmail(admin.auth, c.req.raw.headers, {
          newEmail: patch.email,
          callbackURL: `${options.publicBaseUrl}/admin/settings`
        });
      }
    } catch (error: unknown) {
      if (error instanceof Error && /unique|duplicate/i.test(error.message)) {
        return c.json({ error: "email_in_use" }, 409);
      }
      throw error;
    }

    return c.json({ ok: true });
  });

  app.post("/change-password", async (c) => {
    const admin = options.registry.get("admin");
    if (!admin) {
      return c.json({ error: "admin_not_configured" }, 500);
    }

    const session = await getSession(admin.auth, c.req.raw.headers);
    if (!session) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const input = parseChangePasswordInput(await c.req.json().catch(() => ({})));
    if (!input) {
      return c.json({ error: "invalid_body" }, 400);
    }

    if (input.newPassword.length < 12) {
      return c.json({ error: "weak_password" }, 400);
    }

    const response = await changePassword(admin.auth, c.req.raw.headers, {
      currentPassword: input.currentPassword,
      newPassword: input.newPassword
    });

    await markPasswordChanged(admin.projectDb.pool, session.user.id);

    return c.json(response);
  });

  registerProjectRoutes(routeContext);
  registerBillingRoutes(routeContext);
  registerStorageRoutes(routeContext);

  registerUserRoutes(routeContext);

  return app;
}

export const __adminTestUtils = {
  isTrustedAdminRequest
};
