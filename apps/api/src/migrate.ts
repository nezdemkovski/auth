import { loadEnv } from "./config/env";
import { migrateDatabase } from "./db/migrate";
import { logError, logInfo } from "./runtime/logger";

try {
  const migratedRealms = await migrateDatabase(loadEnv());
  logInfo("auth_database_migration_complete", { migratedRealms });
} catch (error) {
  logError("auth_database_migration_failed", {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
}
