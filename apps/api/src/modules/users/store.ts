import { and, desc, eq, gt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import { authSessions, authUsers } from "../../db/auth-tables";

export type ProjectUserRow = {
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

export const readProjectCounts = async (pool: Pool) => {
  const db = drizzle({ client: pool });
  const userRows = await db
    .select({
      count: sql<number>`COUNT(*)::int`
    })
    .from(authUsers);
  const sessionRows = await db
    .select({
      count: sql<number>`COUNT(*)::int`
    })
    .from(authSessions)
    .where(gt(authSessions.expiresAt, sql`now()`));

  return {
    userCount: Number(userRows[0]?.count ?? 0),
    activeSessionCount: Number(sessionRows[0]?.count ?? 0)
  };
};

export const readProjectUsers = async (pool: Pool) => {
  const db = drizzle({ client: pool });
  return db
    .select({
      id: authUsers.id,
      email: authUsers.email,
      name: authUsers.name,
      role: authUsers.role,
      banned: authUsers.banned,
      emailVerified: authUsers.emailVerified,
      createdAt: authUsers.createdAt,
      updatedAt: authUsers.updatedAt,
      sessionCount: sql<number>`COUNT(${authSessions.id})::int`
    })
    .from(authUsers)
    .leftJoin(
      authSessions,
      and(
        eq(authSessions.userId, authUsers.id),
        gt(authSessions.expiresAt, sql`now()`)
      )
    )
    .groupBy(
      authUsers.id,
      authUsers.email,
      authUsers.name,
      authUsers.role,
      authUsers.banned,
      authUsers.emailVerified,
      authUsers.createdAt,
      authUsers.updatedAt
    )
    .orderBy(desc(authUsers.createdAt))
    .limit(100);
};

export const terminateUserSessions = async (pool: Pool, userId: string) => {
  const db = drizzle({ client: pool });
  const rows = await db
    .delete(authSessions)
    .where(
      and(
        eq(authSessions.userId, userId),
        gt(authSessions.expiresAt, sql`now()`)
      )
    )
    .returning({ id: authSessions.id });

  return rows.length;
};

export const updateUserImage = async (pool: Pool, userId: string, image: string) => {
  const db = drizzle({ client: pool });
  await db
    .update(authUsers)
    .set({
      image,
      updatedAt: sql`now()`
    })
    .where(eq(authUsers.id, userId));
};
