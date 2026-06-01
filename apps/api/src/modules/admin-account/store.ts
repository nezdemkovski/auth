import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import { authBootstrapState, authUsers } from "../../db/auth-tables";

export type AdminProfilePatch = {
  name?: string;
  email?: string;
};

export const mustChangePassword = async (pool: Pool, userId: string) => {
  const db = drizzle({ client: pool });
  const rows = await db
    .select({
      mustChangePassword: authBootstrapState.mustChangePassword
    })
    .from(authBootstrapState)
    .where(eq(authBootstrapState.userId, userId))
    .limit(1);

  return rows[0]?.mustChangePassword ?? false;
};

export const updateAdminProfile = async (pool: Pool, userId: string, patch: AdminProfilePatch) => {
  const db = drizzle({ client: pool });
  const update = profileUpdate(patch);

  if (!update) {
    return;
  }

  await db
    .update(authUsers)
    .set(update)
    .where(eq(authUsers.id, userId));
};

export const markPasswordChanged = async (pool: Pool, userId: string) => {
  const db = drizzle({ client: pool });

  await db
    .update(authBootstrapState)
    .set({
      mustChangePassword: false,
      changedAt: sql`now()`
    })
    .where(eq(authBootstrapState.userId, userId));
};

const profileUpdate = (patch: AdminProfilePatch) => {
  const update: {
    name?: string;
    email?: string;
    updatedAt: Date | ReturnType<typeof sql>;
  } = {
    updatedAt: sql`now()`
  };

  if (patch.name !== undefined) {
    update.name = patch.name;
  }
  if (patch.email !== undefined) {
    update.email = patch.email;
  }

  return update.name === undefined && update.email === undefined ? null : update;
};
