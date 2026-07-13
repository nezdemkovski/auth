import type { AdminDatabase } from "@nezdemkovski/auth-platform-database";
import type { AuthProject } from "../config/projects";

export {
  createAdminDatabase,
  createAdminPool,
  withAdminDb,
  type AdminDatabase,
  type AdminSchema
} from "@nezdemkovski/auth-platform-database";

export type AdminDatabaseOptions = {
  databaseUrl: string;
  adminProject: AuthProject;
  adminDb?: AdminDatabase;
};
