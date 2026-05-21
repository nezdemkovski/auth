import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { bearer, jwt } from "better-auth/plugins";

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
    plugins: [
      bearer(),
      jwt({
        jwks: {
          jwksPath: "/.well-known/jwks.json",
          keyPairConfig: {
            alg: "RS256",
            modulusLength: 2048
          }
        },
        jwt: {
          issuer: `${publicBaseUrl}/${project.slug}`,
          audience: project.slug,
          expirationTime: "15 minutes",
          definePayload: ({ user }) => ({
            sub: user.id,
            email: user.email,
            project: project.slug
          })
        }
      })
    ],
    advanced: {
      cookiePrefix: `auth_${project.slug}`
    },
    telemetry: {
      enabled: false
    }
  });
}
