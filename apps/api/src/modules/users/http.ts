import {
  IdentityServiceError,
  parseResendVerificationEmail
} from "@nezdemkovski/auth-identity";
import {
  auditLog,
  domainErrorResponse,
  parseJson,
  requireAdmin,
  requireRegisteredProject,
  type AdminRouteRegistration
} from "../../http/admin/shared";
import { ErrorCode } from "../../runtime/error-codes";

export const registerUserRoutes: AdminRouteRegistration = ({
  app,
  options,
  usersService
}) => {
  app.get("/projects/:project/users", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: ErrorCode.Unauthorized }, 401);
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
      return c.json({ error: ErrorCode.Unauthorized }, 401);
    }

    const project = requireRegisteredProject(options, c.req.param("project"));
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }

    const terminated = await usersService.terminateSessions(
      project.registered,
      c.req.param("userId")
    );
    auditLog("user.sessions.terminated", {
      actorId: admin.session.user.id,
      actorEmail: admin.session.user.email,
      projectSlug: project.registered.project.slug,
      targetUserId: c.req.param("userId")
    });
    return c.json({ terminated });
  });

  app.post("/projects/:project/users/resend-verification", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: ErrorCode.Unauthorized }, 401);
    }

    const project = requireRegisteredProject(options, c.req.param("project"));
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }

    const email = parseResendVerificationEmail(await parseJson(c.req));
    if (!email) {
      return c.json({ error: ErrorCode.InvalidBody }, 400);
    }

    try {
      await usersService.resendVerification(project.registered, email);
      auditLog("user.verification_email.resent", {
        actorId: admin.session.user.id,
        actorEmail: admin.session.user.email,
        projectSlug: project.registered.project.slug,
        targetEmail: email
      });
    } catch (error) {
      if (error instanceof IdentityServiceError) {
        return domainErrorResponse(error);
      }
      throw error;
    }

    return c.json({ ok: true });
  });
};
