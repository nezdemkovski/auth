import { Pool } from "pg";

import type { AuthProject } from "../config/projects";

export const createAdminPool = (databaseUrl: string, adminProject: AuthProject) => {
  return new Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${adminProject.schema},public`
  });
};
