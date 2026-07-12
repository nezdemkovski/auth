import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import { admin, bearer, jwt, lastLoginMethod, twoFactor } from "better-auth/plugins";
import { agentAuth } from "@better-auth/agent-auth";
import { oauthProvider } from "@better-auth/oauth-provider";
import { passkey } from "@better-auth/passkey";
import { telegram } from "@nezdemkovski/better-auth-telegram";
import { checkout, polar, portal, usage, webhooks } from "@polar-sh/better-auth";
import { Polar } from "@polar-sh/sdk";

import {
  AuthUserRole,
  BillingProvider,
  type AuthProject
} from "../config/projects";
import {
  isSocialProviderConfigured,
  isOAuthSocialProvider,
  SocialProvider
} from "../config/social-providers";
import { TRUSTED_CLIENT_IP_HEADER } from "../config/proxy";
import { SOCIAL_PROVIDER_IDS } from "../config/social-providers";
import type { ProjectDatabase } from "../db/project-db";
import type { EmailSender } from "../email/sender";
import { createProjectEmailHandlers } from "../email/templates";
import { sha256Hex } from "../runtime/crypto";
import { logInfo } from "../runtime/logger";
import type { PolarWebhookHandlers } from "../modules/billing/webhooks";

type ProjectAuthOptions = {
  project: AuthProject;
  projectDb: ProjectDatabase;
  publicBaseUrl: string;
  secret: string;
  emailSender: EmailSender | null;
  trustProxyHeaders: boolean;
  polarWebhookHandlers?: (project: AuthProject) => PolarWebhookHandlers;
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
      trustProxyHeaders: options.trustProxyHeaders,
      polarWebhookHandlers: options.polarWebhookHandlers
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

export const createBaseProjectAuthOptions = (options: {
  project: AuthProject;
  publicBaseUrl: string;
  secret: string;
  emailSender: EmailSender | null;
  trustProxyHeaders: boolean;
  polarWebhookHandlers?: (project: AuthProject) => PolarWebhookHandlers;
}) => {
  const { project, publicBaseUrl, secret } = options;
  const realmSecret = projectAuthSecret(secret, project.slug);
  const publicOrigin = new URL(publicBaseUrl).origin;
  const publicHostname = new URL(publicBaseUrl).hostname;
  const emailHandlers = createProjectEmailHandlers({
    sender: options.emailSender,
    project
  });

  return {
    appName: project.name,
    baseURL: `${publicBaseUrl}/api/${project.slug}/auth`,
    secret: realmSecret,
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
        defaultRole: AuthUserRole.User,
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
        allowUnauthenticatedClientRegistration: false,
        validAudiences: buildOAuthValidAudiences(project, publicBaseUrl),
        silenceWarnings: {
          oauthAuthServerConfig: true,
          openidConfig: true
        }
      }),
      ...buildTelegramPlugin(project),
      lastLoginMethod({
        customResolveMethod: (ctx) => {
          if (ctx.path === "/passkey/verify-authentication") {
            return "passkey";
          }

          return null;
        }
      }),
      ...buildPolarPlugins(project, options.polarWebhookHandlers?.(project)),
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
            project: project.slug,
            telegram_id: user.telegramId
          })
        }
      })
    ],
    advanced: {
      cookiePrefix: `auth_${project.slug}`,
      ...(options.trustProxyHeaders
        ? {
            ipAddress: {
              ipAddressHeaders: [TRUSTED_CLIENT_IP_HEADER]
            }
          }
        : {})
    },
    telemetry: {
      enabled: false
    }
  };
};

export const projectAuthSecret = (rootSecret: string, projectSlug: string) => {
  return sha256Hex(`better-auth-session:v1:${projectSlug}:${rootSecret}`);
};

const buildPolarPlugins = (
  project: AuthProject,
  polarWebhookHandlers: PolarWebhookHandlers | undefined
) => {
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
            ...(polarWebhookHandlers ?? {
              onPayload: async (payload) => {
                logInfo("polar_webhook_received", {
                  projectSlug: project.slug,
                  type: payload.type
                });
              }
            })
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
    if (!isOAuthSocialProvider(provider)) {
      continue;
    }
    const settings = project.socialProviders[provider];
    socialProviders[provider] = {
      enabled: settings.enabled && isSocialProviderConfigured(provider, settings),
      clientId: settings.clientId,
      clientSecret: settings.clientSecret
    };
  }

  return socialProviders;
};

const buildTelegramPlugin = (project: AuthProject) => {
  const settings = project.socialProviders[SocialProvider.Telegram];
  if (!settings.enabled || !isSocialProviderConfigured(SocialProvider.Telegram, settings)) {
    return [];
  }

  return [
    telegram({
      botToken: settings.clientSecret,
      botUsername: settings.clientId,
      loginWidget: false,
      miniApp: {
        enabled: true,
        validateInitData: true,
        allowAutoSignin: true,
        mapMiniAppDataToUser: (user) => ({
          name: user.last_name ? `${user.first_name} ${user.last_name}` : user.first_name,
          email: `telegram-${user.id}@telegram.invalid`,
          image: user.photo_url
        })
      }
    })
  ];
};

export const buildOAuthValidAudiences = (project: AuthProject, publicBaseUrl: string) => {
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
