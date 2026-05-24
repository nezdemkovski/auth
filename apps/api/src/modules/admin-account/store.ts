import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

export type AdminProfilePatch = {
  name?: string;
  email?: string;
};

export async function mustChangePassword(
  pool: Pool,
  userId: string
): Promise<boolean> {
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
  patch: AdminProfilePatch
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
