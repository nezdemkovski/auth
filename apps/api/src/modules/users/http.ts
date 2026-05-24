import { EmailProvider } from "../../email/sender";
import {
  readProjectUsers,
  terminateUserSessions
} from "./store";
import {
  requireAdmin,
  requireRegisteredProject,
  sendVerificationEmail,
  toIsoString,
  type AdminRouteRegistration
} from "../../http/admin/shared";
import { parseResendVerificationEmail } from "./validator";

export const registerUserRoutes: AdminRouteRegistration = ({
  app,
  options,
  getDeliverySettings
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

    const users = await readProjectUsers(project.registered.projectDb.pool);

    return c.json({
      project: {
        slug: project.registered.project.slug,
        name: project.registered.project.name,
        schema: project.registered.project.schema,
        description: project.registered.project.description,
        iconUrl: project.registered.project.iconUrl,
        appUrl: project.registered.project.appUrl,
        trustedOrigins: project.registered.project.trustedOrigins,
        system: project.registered.project.slug === options.adminProject.slug
      },
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        banned: user.banned ?? false,
        emailVerified: user.emailVerified,
        createdAt: toIsoString(user.createdAt),
        updatedAt: toIsoString(user.updatedAt),
        sessionCount: Number(user.sessionCount)
      }))
    });
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

    const userId = c.req.param("userId");
    const terminated = await terminateUserSessions(project.registered.projectDb.pool, userId);

    return c.json({
      terminated
    });
  });

  app.post("/projects/:project/users/resend-verification", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    if (getDeliverySettings().provider === EmailProvider.None) {
      return c.json({ error: "email_service_disabled" }, 409);
    }

    const project = requireRegisteredProject(options, c.req.param("project"));
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }

    const email = parseResendVerificationEmail(await c.req.json().catch(() => ({})));
    if (!email) {
      return c.json({ error: "invalid_body" }, 400);
    }

    await sendVerificationEmail(project.registered.auth, {
      email,
      callbackURL: project.registered.project.trustedOrigins[0]
    });

    return c.json({ ok: true });
  });
};
