import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Hono } from "hono";
import type { Pool } from "pg";

import type { AuthRegistry } from "../auth/registry";
import type { AuthProject } from "../config/projects";
import {
  updateProjectSettings,
  type ProjectSettingsPatch
} from "../db/project-settings";

type AdminApiOptions = {
  registry: AuthRegistry;
  emailServiceEnabled: boolean;
  databaseUrl: string;
  adminProject: AuthProject;
};

type AdminSession = {
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

type ChangePasswordBody = {
  currentPassword?: unknown;
  newPassword?: unknown;
};

type ResendVerificationBody = {
  email?: unknown;
};

type UpdateProjectBody = Partial<Record<keyof ProjectSettingsPatch, unknown>>;

type RegisteredProject = NonNullable<ReturnType<AuthRegistry["get"]>>;

type ProjectUserRow = {
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

export function createAdminApi(options: AdminApiOptions): Hono {
  const app = new Hono();

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
      emailServiceEnabled: options.emailServiceEnabled
    });
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

    const body = (await c.req.json().catch(() => ({}))) as ChangePasswordBody;
    if (typeof body.currentPassword !== "string" || typeof body.newPassword !== "string") {
      return c.json({ error: "invalid_body" }, 400);
    }

    if (body.newPassword.length < 12) {
      return c.json({ error: "weak_password" }, 400);
    }

    const response = await changePassword(admin.auth, c.req.raw.headers, {
      currentPassword: body.currentPassword,
      newPassword: body.newPassword
    });

    await markPasswordChanged(admin.projectDb.pool, session.user.id);

    return c.json(response);
  });

  app.get("/projects", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const projects = await Promise.all(
      options.registry.list().map(async (project) => {
        const registered = options.registry.get(project.slug);
        if (!registered) {
          return null;
        }

        const counts = await readProjectCounts(registered.projectDb.pool);
        return serializeProject(project, counts);
      })
    );

    return c.json({
      projects: projects.filter((project) => project !== null)
    });
  });

  app.patch("/projects/:project", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const registered = options.registry.get(c.req.param("project"));
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }

    if (registered.project.slug === options.adminProject.slug) {
      return c.json({ error: "system_project_locked" }, 409);
    }

    const body = (await c.req.json().catch(() => ({}))) as UpdateProjectBody;
    const patch = parseProjectSettingsPatch(body);
    if (!patch) {
      return c.json({ error: "invalid_body" }, 400);
    }

    try {
      const updated = await updateProjectSettings({
        databaseUrl: options.databaseUrl,
        adminProject: options.adminProject,
        slug: registered.project.slug,
        patch
      });

      if (!updated) {
        return c.json({ error: "unknown_project" }, 404);
      }

      await options.registry.updateProject(updated);
      const next = options.registry.get(updated.slug);
      const counts = next ? await readProjectCounts(next.projectDb.pool) : undefined;

      return c.json({
        project: serializeProject(updated, counts)
      });
    } catch (error) {
      return c.json(
        {
          error: "invalid_project_settings",
          message: error instanceof Error ? error.message : "Invalid project settings"
        },
        400
      );
    }
  });

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

    if (!options.emailServiceEnabled) {
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

  return app;
}

function serializeProject(
  project: AuthProject,
  counts: { userCount: number; activeSessionCount: number } = {
    userCount: 0,
    activeSessionCount: 0
  }
) {
  return {
    slug: project.slug,
    name: project.name,
    schema: project.schema,
    description: project.description,
    iconUrl: project.iconUrl,
    appUrl: project.appUrl,
    trustedOrigins: project.trustedOrigins,
    system: project.slug === "admin",
    ...counts
  };
}

function parseProjectSettingsPatch(body: UpdateProjectBody): ProjectSettingsPatch | null {
  if (
    typeof body.name !== "string" ||
    typeof body.description !== "string" ||
    typeof body.iconUrl !== "string" ||
    typeof body.appUrl !== "string" ||
    !Array.isArray(body.trustedOrigins) ||
    !body.trustedOrigins.every((origin) => typeof origin === "string")
  ) {
    return null;
  }

  return {
    name: body.name.trim(),
    description: body.description.trim(),
    iconUrl: body.iconUrl.trim(),
    appUrl: body.appUrl.trim(),
    trustedOrigins: body.trustedOrigins.map((origin) => origin.trim()).filter(Boolean)
  };
}

async function requireAdmin(
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

async function getSession(auth: unknown, headers: Headers): Promise<AdminSession | null> {
  const api = (auth as {
    api: {
      getSession(input: { headers: Headers }): Promise<AdminSession | null>;
    };
  }).api;

  return api.getSession({ headers });
}

async function changePassword(
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

async function sendVerificationEmail(
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

async function mustChangePassword(pool: Pool, userId: string): Promise<boolean> {
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

async function markPasswordChanged(pool: Pool, userId: string): Promise<void> {
  const db = drizzle({ client: pool });

  await db.execute(sql`
    UPDATE auth_bootstrap_state
    SET must_change_password = false,
        changed_at = now()
    WHERE key = 'initial_admin'
      AND user_id = ${userId}
  `);
}

async function readProjectCounts(pool: Pool): Promise<{
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

async function readProjectUsers(pool: Pool): Promise<ProjectUserRow[]> {
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

async function terminateUserSessions(pool: Pool, userId: string): Promise<number> {
  const db = drizzle({ client: pool });
  const result = await db.execute<{ id: string }>(sql`
    DELETE FROM "session"
    WHERE "userId" = ${userId}
      AND "expiresAt" > now()
    RETURNING id
  `);

  return result.rows.length;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
