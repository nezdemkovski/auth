import { Pool } from "pg";

import type { AuthProject } from "../config/projects";

export function createAdminPool(databaseUrl: string, adminProject: AuthProject): Pool {
  return new Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${adminProject.schema},public`
  });
}
