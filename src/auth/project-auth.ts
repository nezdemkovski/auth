import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import { bearer, jwt } from "better-auth/plugins";
import type { Pool } from "pg";

import type { AuthProject } from "../config/projects";
import type { ProjectDatabase } from "../db/project-db";

type ProjectAuthOptions = {
  project: AuthProject;
  projectDb: ProjectDatabase;
  publicBaseUrl: string;
  secret: string;
};

type ProjectMigrationOptions = {
  project: AuthProject;
  pool: Pool;
  publicBaseUrl: string;
  secret: string;
};

export function createProjectAuth(options: ProjectAuthOptions) {
  const { project, projectDb, publicBaseUrl, secret } = options;

  return betterAuth({
    ...createBaseProjectAuthOptions({
      project,
      publicBaseUrl,
      secret
    }),
    database: projectDb.pool
  });
}

export function createProjectMigrationAuthOptions(
  options: ProjectMigrationOptions
): BetterAuthOptions {
  return {
    ...createBaseProjectAuthOptions({
      project: options.project,
      publicBaseUrl: options.publicBaseUrl,
      secret: options.secret
    }),
    database: options.pool
  };
}

function createBaseProjectAuthOptions(options: {
  project: AuthProject;
  publicBaseUrl: string;
  secret: string;
}): Omit<BetterAuthOptions, "database"> {
  const { project, publicBaseUrl, secret } = options;

  return {
    appName: project.name,
    baseURL: `${publicBaseUrl}/${project.slug}`,
    basePath: "/api/auth",
    secret,
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
  };
}
