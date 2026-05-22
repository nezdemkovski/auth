import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import { admin, bearer, jwt, lastLoginMethod, twoFactor } from "better-auth/plugins";
import { agentAuth } from "@better-auth/agent-auth";
import { oauthProvider } from "@better-auth/oauth-provider";
import { passkey } from "@better-auth/passkey";
import type { Pool } from "pg";

import type { AuthProject } from "../config/projects";
import { SOCIAL_PROVIDER_IDS } from "../config/social-providers";
import type { ProjectDatabase } from "../db/project-db";
import type { EmailSender } from "../email/sender";
import { createProjectEmailHandlers } from "../email/templates";

type ProjectAuthOptions = {
  project: AuthProject;
  projectDb: ProjectDatabase;
  publicBaseUrl: string;
  secret: string;
  emailSender: EmailSender | null;
  trustProxyHeaders: boolean;
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
      secret,
      emailSender: options.emailSender,
      trustProxyHeaders: options.trustProxyHeaders
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
      secret: options.secret,
      emailSender: null,
      trustProxyHeaders: false
    }),
    database: options.pool
  };
}

function createBaseProjectAuthOptions(options: {
  project: AuthProject;
  publicBaseUrl: string;
  secret: string;
  emailSender: EmailSender | null;
  trustProxyHeaders: boolean;
}) {
  const { project, publicBaseUrl, secret } = options;
  const publicOrigin = new URL(publicBaseUrl).origin;
  const publicHostname = new URL(publicBaseUrl).hostname;
  const emailHandlers = createProjectEmailHandlers({
    sender: options.emailSender,
    project
  });

  return {
    appName: project.name,
    baseURL: `${publicBaseUrl}/${project.slug}/api/auth`,
    secret,
    trustedOrigins: project.trustedOrigins,
    socialProviders: buildSocialProviders(project),
    emailAndPassword: {
      enabled: true,
      ...emailHandlers.emailAndPassword
    },
    ...("emailVerification" in emailHandlers
      ? {
          emailVerification: emailHandlers.emailVerification
        }
      : {}),
    plugins: [
      admin({
        defaultRole: "user",
        adminRoles: ["admin"]
      }),
      passkey({
        rpName: project.name,
        rpID: publicHostname,
        origin: publicOrigin
      }),
      twoFactor(),
      agentAuth({
        providerName: project.name,
        providerDescription: project.description || `${project.name} auth realm`,
        capabilities: [
          {
            name: "realm.info",
            description: "Read public metadata for the current auth realm.",
            input: {
              type: "object",
              properties: {},
              additionalProperties: false
            }
          }
        ],
        requireAuthForCapabilities: true,
        validateCapabilities: (capabilities) =>
          capabilities.every((capability) => capability === "realm.info"),
        onExecute: ({ capability }) => {
          if (capability !== "realm.info") {
            throw new Error("Unknown capability");
          }

          return {
            slug: project.slug,
            name: project.name,
            description: project.description
          };
        },
        trustProxy: options.trustProxyHeaders
      }),
      oauthProvider({
        loginPage: `/${project.slug}/login`,
        consentPage: `/${project.slug}/oauth/consent`,
        allowDynamicClientRegistration:
          project.features.oauthProvider.dynamicClientRegistration,
        allowUnauthenticatedClientRegistration: false,
        validAudiences: [
          `${publicBaseUrl}/${project.slug}`,
          `${publicBaseUrl}/${project.slug}/api/auth`
        ],
        silenceWarnings: {
          oauthAuthServerConfig: true,
          openidConfig: true
        }
      }),
      lastLoginMethod({
        customResolveMethod: (ctx) => {
          if (ctx.path === "/passkey/verify-authentication") {
            return "passkey";
          }

          return null;
        }
      }),
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
            email_verified: user.emailVerified === true,
            project: project.slug
          })
        }
      })
    ],
    advanced: {
      cookiePrefix: `auth_${project.slug}`,
      ...(options.trustProxyHeaders
        ? {
            ipAddress: {
              ipAddressHeaders: [
                "cf-connecting-ip",
                "x-forwarded-for",
                "x-real-ip",
                "x-client-ip"
              ]
            }
          }
        : {})
    },
    telemetry: {
      enabled: false
    }
  };
}

function buildSocialProviders(project: AuthProject): BetterAuthOptions["socialProviders"] {
  return Object.fromEntries(
    SOCIAL_PROVIDER_IDS.map((provider) => {
      const settings = project.socialProviders[provider];
      const enabled = settings.enabled && Boolean(settings.clientId && settings.clientSecret);

      return [
        provider,
        {
          enabled,
          clientId: settings.clientId,
          clientSecret: settings.clientSecret
        }
      ];
    })
  ) as BetterAuthOptions["socialProviders"];
}

export const __projectAuthTestUtils = {
  createBaseProjectAuthOptions
};
