import { Hono } from "hono";
import type { Pool } from "pg";

import type { AuthRegistry } from "../auth/registry";

type AdminApiOptions = {
  registry: AuthRegistry;
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
      mustChangePassword: await mustChangePassword(admin.projectDb.pool, session.user.id)
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

    await admin.projectDb.pool.query(
      `UPDATE auth_bootstrap_state
       SET must_change_password = false,
           changed_at = now()
       WHERE key = 'initial_admin'
         AND user_id = $1`,
      [session.user.id]
    );

    return c.json(response);
  });

  return app;
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

async function mustChangePassword(pool: Pool, userId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT must_change_password
     FROM auth_bootstrap_state
     WHERE key = 'initial_admin'
       AND user_id = $1
     LIMIT 1`,
    [userId]
  );

  return result.rows[0]?.must_change_password ?? false;
}
