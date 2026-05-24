import type { RegisteredProject } from "../../auth/registry";
import {
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
    const admin = await requireAdminAccount(options.registry.get("admin"), c.req.raw.headers);
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
    const admin = await requireAdminAccount(options.registry.get("admin"), c.req.raw.headers);
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
    } catch (error) {
      return adminAccountError(error);
    }

    return c.json({ ok: true });
  });

  app.post("/change-password", async (c) => {
    const admin = await requireAdminAccount(options.registry.get("admin"), c.req.raw.headers);
    if (admin.error) {
      return c.json({ error: admin.error }, admin.status);
    }

    const input = parseChangePasswordInput(await parseJson(c.req));
    if (!input) {
      return c.json({ error: "invalid_body" }, 400);
    }

    try {
      return c.json(
        await adminAccountService.changePassword({
          auth: admin.registered.auth,
          headers: c.req.raw.headers,
          projectDb: admin.registered.projectDb,
          session: admin.session,
          password: input
        })
      );
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

async function requireAdminAccount(
  registered: RegisteredProject | null | undefined,
  headers: Headers
): Promise<AdminAccountLookup> {
  if (!registered) {
    return {
      error: "admin_not_configured",
      status: 500
    };
  }

  const session = await getSession(registered.auth, headers);
  if (!session) {
    return {
      error: "unauthorized",
      status: 401
    };
  }

  return {
    registered,
    session
  };
}

function adminAccountError(error: unknown): Response {
  if (error instanceof AdminAccountServiceError) {
    return Response.json({ error: error.code }, { status: error.status });
  }

  throw error;
}
