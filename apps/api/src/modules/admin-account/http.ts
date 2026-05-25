import type { RegisteredProject } from "../../auth/registry";
import { ADMIN_PROJECT_SLUG } from "../../config/projects";
import {
  auditLog,
  domainErrorResponse,
  getSession,
  parseJson,
  type AdminRouteRegistration,
  type AdminSession
} from "../../http/admin/shared";
import { AdminAccountServiceError } from "./core";
import {
  getProfileCurrentPassword,
  parseAdminProfilePatch,
  parseChangePasswordInput
} from "./validator";

export const registerAdminAccountRoutes: AdminRouteRegistration = ({
  app,
  options,
  adminAccountService
}) => {
  app.get("/me", async (c) => {
    const admin = await requireAdminAccount(options.registry.get(ADMIN_PROJECT_SLUG), c.req.raw.headers);
    if (admin.error) {
      return c.json({ error: admin.error }, admin.status);
    }

    return c.json(
      await adminAccountService.currentProfile({
        projectDb: admin.registered.projectDb,
        session: admin.session
      })
    );
  });

  app.patch("/profile", async (c) => {
    const admin = await requireAdminAccount(options.registry.get(ADMIN_PROJECT_SLUG), c.req.raw.headers);
    if (admin.error) {
      return c.json({ error: admin.error }, admin.status);
    }

    const body = await parseJson(c.req);
    const patch = parseAdminProfilePatch(body);
    if (!patch) {
      return c.json({ error: "invalid_body" }, 400);
    }

    try {
      await adminAccountService.updateProfile({
        auth: admin.registered.auth,
        headers: c.req.raw.headers,
        projectDb: admin.registered.projectDb,
        session: admin.session,
        patch,
        currentPassword: getProfileCurrentPassword(body)
      });
      auditLog("admin.profile.updated", {
        actorId: admin.session.user.id,
        actorEmail: admin.session.user.email
      });
    } catch (error) {
      return adminAccountError(error);
    }

    return c.json({ ok: true });
  });

  app.post("/change-password", async (c) => {
    const admin = await requireAdminAccount(options.registry.get(ADMIN_PROJECT_SLUG), c.req.raw.headers);
    if (admin.error) {
      return c.json({ error: admin.error }, admin.status);
    }

    const input = parseChangePasswordInput(await parseJson(c.req));
    if (!input) {
      return c.json({ error: "invalid_body" }, 400);
    }

    try {
      const result = await adminAccountService.changePassword({
        auth: admin.registered.auth,
        headers: c.req.raw.headers,
        projectDb: admin.registered.projectDb,
        session: admin.session,
        password: input
      });
      auditLog("admin.password.changed", {
        actorId: admin.session.user.id,
        actorEmail: admin.session.user.email
      });
      return c.json(result);
    } catch (error) {
      return adminAccountError(error);
    }
  });
};

type AdminAccountLookup =
  | {
      registered: RegisteredProject;
      session: AdminSession;
      error?: never;
      status?: never;
    }
  | {
      registered?: never;
      session?: never;
      error: "admin_not_configured" | "unauthorized";
      status: 500 | 401;
    };

const requireAdminAccount = async (registered: RegisteredProject | null | undefined, headers: Headers) => {
  if (!registered) {
    const lookup: AdminAccountLookup = {
      error: "admin_not_configured",
      status: 500
    };

    return lookup;
  }

  const session = await getSession(registered.auth, headers);
  if (!session) {
    const lookup: AdminAccountLookup = {
      error: "unauthorized",
      status: 401
    };

    return lookup;
  }

  const lookup: AdminAccountLookup = {
    registered,
    session
  };

  return lookup;
};

const adminAccountError = (error: unknown) => {
  if (error instanceof AdminAccountServiceError) {
    return domainErrorResponse(error);
  }

  throw error;
};
