import {
  parseJson,
  requireAdmin,
  requireRegisteredProject,
  type AdminRouteRegistration
} from "../../http/admin/shared";
import { UsersServiceError } from "./core";
import { parseResendVerificationEmail } from "./validator";

export const registerUserRoutes: AdminRouteRegistration = ({
  app,
  options,
  usersService
}) => {
  app.get("/projects/:project/users", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const project = requireRegisteredProject(options, c.req.param("project"));
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }

    return c.json(await usersService.listUsers(project.registered));
  });

  app.post("/projects/:project/users/:userId/terminate-sessions", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const project = requireRegisteredProject(options, c.req.param("project"));
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }

    return c.json({
      terminated: await usersService.terminateSessions(
        project.registered,
        c.req.param("userId")
      )
    });
  });

  app.post("/projects/:project/users/resend-verification", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const project = requireRegisteredProject(options, c.req.param("project"));
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }

    const email = parseResendVerificationEmail(await parseJson(c.req));
    if (!email) {
      return c.json({ error: "invalid_body" }, 400);
    }

    try {
      await usersService.resendVerification(project.registered, email);
    } catch (error) {
      if (error instanceof UsersServiceError) {
        return c.json({ error: error.code }, error.status);
      }
      throw error;
    }

    return c.json({ ok: true });
  });
};
