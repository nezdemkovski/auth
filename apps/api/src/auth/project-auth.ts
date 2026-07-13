import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import { admin, bearer, jwt, lastLoginMethod, twoFactor } from "better-auth/plugins";
import { agentAuth } from "@better-auth/agent-auth";
import { oauthProvider } from "@better-auth/oauth-provider";
import { passkey } from "@better-auth/passkey";
import {
  createProjectEmailHandlers,
  type EmailSender
} from "@nezdemkovski/auth-delivery";
import {
  isBuiltInSocialProvider,
  isSocialProviderConfigured,
  SOCIAL_PROVIDER_IDS,
  SocialProvider
} from "@nezdemkovski/auth-realm";

import {
  OAUTH_DYNAMIC_CLIENT_SCOPES,
  OAUTH_SCOPES,
  OAuthTokenKind,
  oauthResourceDefinitions,
  oauthTokenKindClaim
} from "../config/oauth-resources";
import { AuthUserRole, type AuthProject } from "../config/projects";
import { TRUSTED_CLIENT_IP_HEADER } from "../config/proxy";
import type { ProjectDatabase } from "../db/project-db";
import { sha256Hex } from "../runtime/crypto";
import { mustEnrollTwoFactor } from "./policy";
import { createTelegramOidcPlugin } from "./telegram";

type ProjectAuthPlugin = NonNullable<
  NonNullable<BetterAuthOptions["plugins"]>[number]
>;

export type ProjectAuthPluginContribution = (
  project: AuthProject
) => ProjectAuthPlugin[];

type ProjectAuthOptions = {
  project: AuthProject;
  projectDb: ProjectDatabase;
  publicBaseUrl: string;
  secret: string;
  emailSender: EmailSender | null;
  trustProxyHeaders: boolean;
  pluginContributions?: ProjectAuthPluginContribution[];
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
      pluginContributions: options.pluginContributions
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
  pluginContributions?: ProjectAuthPluginContribution[];
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
    disabledPaths: ["/token"],
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
      ...buildTelegramOidcPlugins(project),
      oauthProvider({
        loginPage: `/login/${project.slug}`,
        consentPage: `/login/${project.slug}/oauth/consent`,
        postLogin: {
          page: `/login/${project.slug}`,
          shouldRedirect: ({ user }) => {
            return mustEnrollTwoFactor(project.features.twoFactor, user);
          },
          consentReferenceId: () => undefined
        },
        allowDynamicClientRegistration: project.features.oauthProvider.dynamicClientRegistration,
        allowUnauthenticatedClientRegistration: false,
        scopes: OAUTH_SCOPES,
        resources: project.features.oauthProvider.enabled
          ? oauthResourceDefinitions(publicBaseUrl, project.slug)
          : [],
        customAccessTokenClaims: ({ user }) => ({
          [oauthTokenKindClaim(publicBaseUrl)]:
            user === undefined ? OAuthTokenKind.Service : OAuthTokenKind.User
        }),
        resourceSeedMode: "overwrite",
        enforcePerClientResources: true,
        clientRegistrationDefaultScopes: OAUTH_DYNAMIC_CLIENT_SCOPES,
        clientRegistrationAllowedScopes: OAUTH_DYNAMIC_CLIENT_SCOPES,
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
      ...(options.pluginContributions ?? []).flatMap((contribute) =>
        contribute(project)
      ),
      bearer(),
      jwt({
        disableSettingJwtHeader: true,
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
            name: user.name,
            image: user.image,
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

const buildSocialProviders = (project: AuthProject) => {
  const socialProviders: NonNullable<BetterAuthOptions["socialProviders"]> = {};

  for (const provider of SOCIAL_PROVIDER_IDS) {
    if (!isBuiltInSocialProvider(provider)) {
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

const buildTelegramOidcPlugins = (project: AuthProject) => {
  const settings = project.socialProviders[SocialProvider.Telegram];
  if (!settings.enabled || !isSocialProviderConfigured(SocialProvider.Telegram, settings)) {
    return [];
  }

  return [
    createTelegramOidcPlugin(settings)
  ];
};
