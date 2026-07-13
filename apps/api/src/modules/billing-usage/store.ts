import { identitySubjectExists } from "@nezdemkovski/auth-identity";
import type { ProjectDatabase } from "@nezdemkovski/auth-better-auth-runtime";

export const createBillingSubjectDirectory = (projectDb: ProjectDatabase) => ({
  exists: (subject: string) => identitySubjectExists(projectDb.pool, subject)
});
