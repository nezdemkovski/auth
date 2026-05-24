import { EmailProvider } from "../../../email/sender";
import {
  readProjectUsers,
  requireAdmin,
  sendVerificationEmail,
  terminateUserSessions,
  toIsoString,
  type AdminRouteRegistration
} from "../shared";

type ResendVerificationBody = {
  email?: unknown;
};

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

    const registered = options.registry.get(c.req.param("project"));
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }

    const users = await readProjectUsers(registered.projectDb.pool);

    return c.json({
      project: {
        slug: registered.project.slug,
        name: registered.project.name,
        schema: registered.project.schema,
        description: registered.project.description,
        iconUrl: registered.project.iconUrl,
        appUrl: registered.project.appUrl,
        trustedOrigins: registered.project.trustedOrigins,
        system: registered.project.slug === options.adminProject.slug
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

    const registered = options.registry.get(c.req.param("project"));
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }

    const userId = c.req.param("userId");
    const terminated = await terminateUserSessions(registered.projectDb.pool, userId);

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

    const registered = options.registry.get(c.req.param("project"));
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }

    const body = (await c.req.json().catch(() => ({}))) as ResendVerificationBody;
    if (typeof body.email !== "string") {
      return c.json({ error: "invalid_body" }, 400);
    }

    await sendVerificationEmail(registered.auth, {
      email: body.email,
      callbackURL: registered.project.trustedOrigins[0]
    });

    return c.json({ ok: true });
  });
};
