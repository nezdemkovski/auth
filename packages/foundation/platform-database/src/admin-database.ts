import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export type AdminSchema = {
  schema: string;
};

export type AdminDatabase = {
  db: ReturnType<typeof drizzle>;
  pool: Pool;
};

export type AdminDatabaseOptions = {
  databaseUrl: string;
  adminProject: AdminSchema;
  adminDb?: AdminDatabase;
};

export const createAdminPool = (
  databaseUrl: string,
  adminProject: AdminSchema
) => {
  return new Pool({
    connectionString: databaseUrl,
    options: `-c search_path="${adminProject.schema}",public`,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000
  });
};

export const createAdminDatabase = (
  databaseUrl: string,
  adminProject: AdminSchema
) => {
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
