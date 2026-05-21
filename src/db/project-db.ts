import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import type { AuthProject } from "../config/projects";

export type ProjectDatabase = {
  db: ReturnType<typeof drizzle>;
  pool: Pool;
};

export function createProjectDatabase(databaseUrl: string, project: AuthProject): ProjectDatabase {
  const pool = new Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${project.schema},public`
  });

  return {
    db: drizzle({
      client: pool
    }),
    pool
  };
}
