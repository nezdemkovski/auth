import { eq } from "drizzle-orm";

import { authUsers } from "../../db/auth-tables";
import type { ProjectDatabase } from "../../db/project-db";

export {
  commitBillingUsageReservation,
  consumeBillingUsage,
  readBillingUsageSummary,
  releaseBillingUsageReservation,
  reserveBillingUsage
} from "../billing/usage-store";

export const billingUsageSubjectExists = async (
  projectDb: ProjectDatabase,
  subject: string
): Promise<boolean> => {
  const rows = await projectDb.db
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(eq(authUsers.id, subject))
    .limit(1);

  return rows.length === 1;
};
