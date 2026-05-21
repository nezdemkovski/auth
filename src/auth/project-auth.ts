import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";

import type { AuthProject } from "../config/projects";
import type { ProjectDatabase } from "../db/project-db";

type ProjectAuthOptions = {
  project: AuthProject;
  projectDb: ProjectDatabase;
  publicBaseUrl: string;
  secret: string;
};

export function createProjectAuth(options: ProjectAuthOptions) {
  const { project, projectDb, publicBaseUrl, secret } = options;

  return betterAuth({
    appName: project.name,
    baseURL: `${publicBaseUrl}/${project.slug}`,
    basePath: "/api/auth",
    secret,
    database: drizzleAdapter(projectDb.db, {
      provider: "pg"
    }),
    trustedOrigins: project.trustedOrigins,
    emailAndPassword: {
      enabled: true
    },
    advanced: {
      cookiePrefix: `auth_${project.slug}`
    },
    telemetry: {
      enabled: false
    }
  });
}
