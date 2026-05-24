import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

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

export async function readProjectCounts(pool: Pool): Promise<{
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

export async function readProjectUsers(pool: Pool): Promise<ProjectUserRow[]> {
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

export async function terminateUserSessions(
  pool: Pool,
  userId: string
): Promise<number> {
  const db = drizzle({ client: pool });
  const result = await db.execute<{ id: string }>(sql`
    DELETE FROM "session"
    WHERE "userId" = ${userId}
      AND "expiresAt" > now()
    RETURNING id
  `);

  return result.rows.length;
}
