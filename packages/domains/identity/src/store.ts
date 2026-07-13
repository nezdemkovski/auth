import { and, count, desc, eq, gt, ilike } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import {
  IdentityBootstrapKey,
  type AdminProfilePatch,
  type IdentityUserRow
} from "./model";
import {
  identityBootstrapState,
  identitySessions,
  identityUsers
} from "./tables";

export const readIdentityCounts = async (pool: Pool) => {
  const db = drizzle({ client: pool });
  const now = new Date();
  const userRows = await db
    .select({ count: count(identityUsers.id) })
    .from(identityUsers);
  const sessionRows = await db
    .select({ count: count(identitySessions.id) })
    .from(identitySessions)
    .where(gt(identitySessions.expiresAt, now));

  return {
    userCount: Number(userRows[0]?.count ?? 0),
    activeSessionCount: Number(sessionRows[0]?.count ?? 0)
  };
};

export const readIdentityUsers = async (pool: Pool): Promise<IdentityUserRow[]> => {
  const db = drizzle({ client: pool });
  return db
    .select({
      id: identityUsers.id,
      email: identityUsers.email,
      name: identityUsers.name,
      role: identityUsers.role,
      banned: identityUsers.banned,
      emailVerified: identityUsers.emailVerified,
      createdAt: identityUsers.createdAt,
      updatedAt: identityUsers.updatedAt,
      sessionCount: count(identitySessions.id)
    })
    .from(identityUsers)
    .leftJoin(
      identitySessions,
      and(
        eq(identitySessions.userId, identityUsers.id),
        gt(identitySessions.expiresAt, new Date())
      )
    )
    .groupBy(
      identityUsers.id,
      identityUsers.email,
      identityUsers.name,
      identityUsers.role,
      identityUsers.banned,
      identityUsers.emailVerified,
      identityUsers.createdAt,
      identityUsers.updatedAt
    )
    .orderBy(desc(identityUsers.createdAt))
    .limit(100);
};

export const terminateIdentitySessions = async (pool: Pool, userId: string) => {
  const db = drizzle({ client: pool });
  const rows = await db
    .delete(identitySessions)
    .where(
      and(
        eq(identitySessions.userId, userId),
        gt(identitySessions.expiresAt, new Date())
      )
    )
    .returning({ id: identitySessions.id });

  return rows.length;
};

export const updateIdentityUserImage = async (
  pool: Pool,
  userId: string,
  image: string
) => {
  const db = drizzle({ client: pool });
  await db
    .update(identityUsers)
    .set({
      image,
      updatedAt: new Date()
    })
    .where(eq(identityUsers.id, userId));
};

export const readIdentityUserImage = async (pool: Pool, userId: string) => {
  const db = drizzle({ client: pool });
  const rows = await db
    .select({ image: identityUsers.image })
    .from(identityUsers)
    .where(eq(identityUsers.id, userId))
    .limit(1);

  return rows[0]?.image ?? "";
};

export const identitySubjectExists = async (pool: Pool, subject: string) => {
  const db = drizzle({ client: pool });
  const rows = await db
    .select({ id: identityUsers.id })
    .from(identityUsers)
    .where(eq(identityUsers.id, subject))
    .limit(1);

  return rows.length === 1;
};

export const readIdentityUserByEmail = async (pool: Pool, email: string) => {
  const db = drizzle({ client: pool });
  const rows = await db
    .select({
      id: identityUsers.id,
      email: identityUsers.email,
      role: identityUsers.role
    })
    .from(identityUsers)
    .where(ilike(identityUsers.email, escapeLikePattern(email.trim())))
    .limit(1);

  return rows[0] ?? null;
};

export const updateIdentityUserRole = async (
  pool: Pool,
  userId: string,
  role: string
) => {
  const db = drizzle({ client: pool });
  await db
    .update(identityUsers)
    .set({ role, updatedAt: new Date() })
    .where(eq(identityUsers.id, userId));
};

export const ensureInitialAdminState = async (
  pool: Pool,
  userId: string
) => {
  const db = drizzle({ client: pool });
  await db
    .insert(identityBootstrapState)
    .values({
      key: IdentityBootstrapKey.InitialAdmin,
      userId,
      mustChangePassword: false
    })
    .onConflictDoNothing();
};

export const recordGeneratedInitialAdminState = async (
  pool: Pool,
  userId: string
) => {
  const db = drizzle({ client: pool });
  const generatedAt = new Date();
  await db
    .insert(identityBootstrapState)
    .values({
      key: IdentityBootstrapKey.InitialAdmin,
      userId,
      mustChangePassword: true,
      generatedAt
    })
    .onConflictDoUpdate({
      target: identityBootstrapState.key,
      set: {
        userId,
        mustChangePassword: true,
        generatedAt,
        changedAt: null
      }
    });
};

export const mustChangePassword = async (pool: Pool, userId: string) => {
  const db = drizzle({ client: pool });
  const rows = await db
    .select({
      mustChangePassword: identityBootstrapState.mustChangePassword
    })
    .from(identityBootstrapState)
    .where(eq(identityBootstrapState.userId, userId))
    .limit(1);

  return rows[0]?.mustChangePassword ?? false;
};

export const updateAdminProfile = async (
  pool: Pool,
  userId: string,
  patch: AdminProfilePatch
) => {
  const db = drizzle({ client: pool });
  const update = profileUpdate(patch);

  if (!update) {
    return;
  }

  await db
    .update(identityUsers)
    .set(update)
    .where(eq(identityUsers.id, userId));
};

export const markPasswordChanged = async (pool: Pool, userId: string) => {
  const db = drizzle({ client: pool });

  await db
    .update(identityBootstrapState)
    .set({
      mustChangePassword: false,
      changedAt: new Date()
    })
    .where(eq(identityBootstrapState.userId, userId));
};

const profileUpdate = (patch: AdminProfilePatch) => {
  const update: {
    name?: string;
    email?: string;
    updatedAt: Date;
  } = {
    updatedAt: new Date()
  };

  if (patch.name !== undefined) {
    update.name = patch.name;
  }
  if (patch.email !== undefined) {
    update.email = patch.email;
  }

  return update.name === undefined && update.email === undefined ? null : update;
};

const escapeLikePattern = (value: string) => {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
};
