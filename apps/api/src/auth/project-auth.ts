import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import { admin, bearer, jwt, lastLoginMethod, twoFactor } from "better-auth/plugins";
import { agentAuth } from "@better-auth/agent-auth";
import { oauthProvider } from "@better-auth/oauth-provider";
import { passkey } from "@better-auth/passkey";
import { checkout, polar, portal, usage, webhooks } from "@polar-sh/better-auth";
import { Polar } from "@polar-sh/sdk";

import { BillingProvider, type AuthProject } from "../config/projects";
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
  database: BetterAuthOptions["database"];
  publicBaseUrl: string;
  secret: string;
};

export const createProjectAuth = (options: ProjectAuthOptions) => {
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
};

export const createProjectMigrationAuthOptions = (options: ProjectMigrationOptions) => {
  return {
    ...createBaseProjectAuthOptions({
      project: options.project,
      publicBaseUrl: options.publicBaseUrl,
      secret: options.secret,
      emailSender: null,
      trustProxyHeaders: false
    }),
    database: options.database
  };
};

const createBaseProjectAuthOptions = (options: {
  project: AuthProject;
  publicBaseUrl: string;
  secret: string;
  emailSender: EmailSender | null;
  trustProxyHeaders: boolean;
}) => {
  const { project, publicBaseUrl, secret } = options;
  const publicOrigin = new URL(publicBaseUrl).origin;
  const publicHostname = new URL(publicBaseUrl).hostname;
  const emailHandlers = createProjectEmailHandlers({
    sender: options.emailSender,
    project
  });

  return {
    appName: project.name,
    baseURL: `${publicBaseUrl}/api/${project.slug}/auth`,
    secret,
    trustedOrigins: project.trustedOrigins,
    socialProviders: buildSocialProviders(project),
    emailAndPassword: {
      enabled: true,
      ...emailHandlers.emailAndPassword
    },
    ...("emailVerification" in emailHandlers
      ? {
          emailVerification: emailHandlers.emailVerification,
          user: emailHandlers.user
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
      twoFactor({
        issuer: project.name,
        allowPasswordless: true
      }),
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
        loginPage: `/login/${project.slug}`,
        consentPage: `/login/${project.slug}/oauth/consent`,
        allowDynamicClientRegistration:
          project.features.oauthProvider.dynamicClientRegistration,
        allowUnauthenticatedClientRegistration:
          project.features.oauthProvider.dynamicClientRegistration,
        validAudiences: buildOAuthValidAudiences(project, publicBaseUrl),
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
      ...buildPolarPlugins(project),
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
          issuer: `${publicBaseUrl}/api/${project.slug}`,
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
};

const buildPolarPlugins = (project: AuthProject) => {
  const settings = project.billing;
  const products = settings.products
    .filter((product) => product.active && product.productId.trim())
    .map((product) => ({
      slug: product.slug,
      productId: product.productId
    }));

  if (
    settings.provider !== BillingProvider.Polar ||
    !settings.enabled ||
    !settings.accessToken.trim()
  ) {
    return [];
  }

  const client = new Polar({
    accessToken: settings.accessToken,
    server: settings.environment
  });
  const returnUrl = project.appUrl || project.trustedOrigins[0] || undefined;
  const polarUse: NonNullable<Parameters<typeof polar>[0]["use"]> = [
    checkout({
      products,
      authenticatedUsersOnly: true,
      returnUrl,
      successUrl: returnUrl
    }),
    portal({
      returnUrl
    }),
    usage({
      creditProducts: products
    }),
    ...(settings.webhookSecret.trim()
      ? [
          webhooks({
            secret: settings.webhookSecret,
            onPayload: async (payload) => {
              console.info("[polar] webhook received", {
                project: project.slug,
                type: payload.type
              });
            }
          })
        ]
      : [])
  ];

  return [
    polar({
      client,
      createCustomerOnSignUp: true,
      use: polarUse
    })
  ];
};

const buildSocialProviders = (project: AuthProject) => {
  const socialProviders: NonNullable<BetterAuthOptions["socialProviders"]> = {};

  for (const provider of SOCIAL_PROVIDER_IDS) {
    const settings = project.socialProviders[provider];
    socialProviders[provider] = {
      enabled: settings.enabled && Boolean(settings.clientId && settings.clientSecret),
      clientId: settings.clientId,
      clientSecret: settings.clientSecret
    };
  }

  return socialProviders;
};

const buildOAuthValidAudiences = (project: AuthProject, publicBaseUrl: string) => {
  const audiences = new Set([
    `${publicBaseUrl}/api/${project.slug}`,
    `${publicBaseUrl}/api/${project.slug}/auth`
  ]);

  for (const origin of [project.appUrl, ...project.trustedOrigins]) {
    const normalizedOrigin = normalizeOrigin(origin);
    if (!normalizedOrigin) {
      continue;
    }

    audiences.add(normalizedOrigin);
    audiences.add(`${normalizedOrigin}/mcp`);
  }

  return Array.from(audiences);
};

const normalizeOrigin = (value: string) => {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

export const __projectAuthTestUtils = {
  buildOAuthValidAudiences,
  createBaseProjectAuthOptions
};
