import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import type { AuthProject } from "../config/projects";

export type AdminDatabase = {
  db: ReturnType<typeof drizzle>;
  pool: Pool;
};

export type AdminDatabaseOptions = {
  databaseUrl: string;
  adminProject: AuthProject;
  adminDb?: AdminDatabase;
};

export const createAdminPool = (databaseUrl: string, adminProject: AuthProject) => {
  return new Pool({
    connectionString: databaseUrl,
    options: `-c search_path="${adminProject.schema}",public`,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000
  });
};

export const createAdminDatabase = (databaseUrl: string, adminProject: AuthProject) => {
  const pool = createAdminPool(databaseUrl, adminProject);

  return {
    db: drizzle({ client: pool }),
    pool
  };
};

export const withAdminDb = async <T>(
  options: AdminDatabaseOptions,
  operation: (adminDb: AdminDatabase) => Promise<T>
) => {
  if (options.adminDb) {
    return operation(options.adminDb);
  }

  const adminDb = createAdminDatabase(options.databaseUrl, options.adminProject);
  try {
    return await operation(adminDb);
  } finally {
    await adminDb.pool.end();
  }
};
