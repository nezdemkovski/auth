import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

export const ensureIdentityTables = async (pool: Pool) => {
  const db = drizzle({ client: pool });
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS auth_bootstrap_state (
      key text PRIMARY KEY,
      user_id text NOT NULL,
      must_change_password boolean NOT NULL DEFAULT true,
      generated_at timestamptz NOT NULL DEFAULT now(),
      changed_at timestamptz
    )
  `);
};
