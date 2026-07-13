import { eq } from "drizzle-orm";

import { authUsers } from "../../db/auth-tables";
import type { ProjectDatabase } from "@nezdemkovski/auth-better-auth-runtime";

export const createBillingSubjectDirectory = (projectDb: ProjectDatabase) => ({
  exists: async (subject: string) => {
    const rows = await projectDb.db
      .select({ id: authUsers.id })
      .from(authUsers)
      .where(eq(authUsers.id, subject))
      .limit(1);

    return rows.length === 1;
  }
});
