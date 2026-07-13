import type { Realm } from "@nezdemkovski/auth-realm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export type ProjectDatabase = {
  db: ReturnType<typeof drizzle>;
  pool: Pool;
};

export const createProjectDatabase = (
  databaseUrl: string,
  project: Pick<Realm, "schema">
) => {
  const pool = new Pool({
    connectionString: databaseUrl,
    options: `-c search_path="${project.schema}",public`,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000
  });

  return {
    db: drizzle({
      client: pool
    }),
    pool
  };
};
