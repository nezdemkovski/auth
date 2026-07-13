import { agentAuth } from "@better-auth/agent-auth";
import {
  oauthProvider,
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
  type ResourceServerMetadata
} from "@better-auth/oauth-provider";
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import { passkey } from "@better-auth/passkey";
import { sha256Hex } from "@nezdemkovski/auth-platform-crypto";
import {
  isBuiltInSocialProvider,
  isSocialProviderConfigured,
  SOCIAL_PROVIDER_IDS,
  SocialProvider,
  type Realm
} from "@nezdemkovski/auth-realm";
import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import {
  admin,
  bearer,
  jwt,
  lastLoginMethod,
  twoFactor
} from "better-auth/plugins";
import {
  createDpopReplayStore,
  verifyAccessTokenRequest,
  type ResourceRequestInput
} from "better-auth/oauth2";

import type { ProjectDatabase } from "./database";
import {
  AuthUserRole,
  type ProjectAuth,
  type ProjectAuthEmailContribution,
  type ProjectAuthPluginContribution,
  type ProjectAuthProtocolOptions
} from "./model";
import { mustEnrollTwoFactor } from "./policy";
import { createTelegramOidcPlugin } from "./telegram";

type ProjectAuthOptions<TProject extends Realm> = {
  project: TProject;
  projectDb: ProjectDatabase;
  publicBaseUrl: string;
  secret: string;
  trustedClientIpHeader: string;
  trustProxyHeaders: boolean;
  protocol: ProjectAuthProtocolOptions<TProject>;
  emailContribution?: ProjectAuthEmailContribution<TProject>;
  pluginContributions?: ProjectAuthPluginContribution<TProject>[];
};

type ProjectMigrationOptions<TProject extends Realm> = {
  project: TProject;
  database: BetterAuthOptions["database"];
  publicBaseUrl: string;
  secret: string;
  trustedClientIpHeader: string;
  protocol: ProjectAuthProtocolOptions<TProject>;
};

export const createProjectAuth = <TProject extends Realm>(
  options: ProjectAuthOptions<TProject>
): ProjectAuth => {
  const auth = betterAuth({
    ...buildProjectAuthOptions(options),
    database: options.projectDb.pool
  });
  const { getProtectedResourceMetadata } =
    oauthProviderResourceClient(auth).getActions();

  return {
    handler: (request) => auth.handler(request),
    authorizationServerMetadata: async (request) =>
      oauthProviderAuthServerMetadata(auth)(request),
    openIdConfiguration: async (request) =>
      oauthProviderOpenIdConfigMetadata(auth)(request),
    getProtectedResourceMetadata: (metadata: ResourceServerMetadata) =>
      getProtectedResourceMetadata(metadata),
    verifyAccessTokenRequest: async (
      request: ResourceRequestInput,
      verification
    ) => {
      const context = await auth.$context;
      const claims = await verifyAccessTokenRequest(request, {
        jwksUrl: verification.jwksUrl,
        verifyOptions: {
          issuer: verification.issuer,
          audience: verification.audience
        },
        scopes: verification.scopes,
        dpop: {
          replayStore: createDpopReplayStore(context.internalAdapter)
        }
      });

      return { ...claims };
    },
    api: {
      getSession: (input) => auth.api.getSession(input),
      getAgentConfiguration: (input) =>
        auth.api.getAgentConfiguration(input),
      createUser: (input) => auth.api.createUser(input),
      changeEmail: (input) => auth.api.changeEmail(input),
      changePassword: (input) => auth.api.changePassword(input),
      verifyPassword: (input) => auth.api.verifyPassword(input),
      sendVerificationEmail: (input) =>
        auth.api.sendVerificationEmail(input),
      signInSocial: (input) => auth.api.signInSocial(input),
      adminCreateOAuthClient: (input) =>
        auth.api.adminCreateOAuthClient(input),
      adminLinkClientResource: (input) =>
        auth.api.adminLinkClientResource(input),
      enableTwoFactor: (input) => auth.api.enableTwoFactor(input),
      generateTOTP: (input) => auth.api.generateTOTP(input)
    },
    ready: async () => {
      await auth.$context;
    }
  };
};

export const createProjectMigrationAuthOptions = <TProject extends Realm>(
  options: ProjectMigrationOptions<TProject>
): BetterAuthOptions => {
  return {
    ...buildProjectAuthOptions({
      ...options,
      trustProxyHeaders: false
    }),
    database: options.database
  };
};

export const createBaseProjectAuthOptions = <TProject extends Realm>(options: {
  project: TProject;
  publicBaseUrl: string;
  secret: string;
  trustedClientIpHeader: string;
  trustProxyHeaders: boolean;
  protocol: ProjectAuthProtocolOptions<TProject>;
  emailContribution?: ProjectAuthEmailContribution<TProject>;
  pluginContributions?: ProjectAuthPluginContribution<TProject>[];
}): BetterAuthOptions => {
  return buildProjectAuthOptions(options);
};

const buildProjectAuthOptions = <TProject extends Realm>(options: {
  project: TProject;
  publicBaseUrl: string;
  secret: string;
  trustedClientIpHeader: string;
  trustProxyHeaders: boolean;
  protocol: ProjectAuthProtocolOptions<TProject>;
  emailContribution?: ProjectAuthEmailContribution<TProject>;
  pluginContributions?: ProjectAuthPluginContribution<TProject>[];
}) => {
  const { project, publicBaseUrl, secret } = options;
  const realmSecret = projectAuthSecret(secret, project.slug);
  const publicOrigin = new URL(publicBaseUrl).origin;
  const publicHostname = new URL(publicBaseUrl).hostname;
  const emailHandlers = options.emailContribution?.(project) ?? {};
  const oauthConfig = options.protocol.oauthProvider;

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
    ...(emailHandlers.emailVerification
      ? { emailVerification: emailHandlers.emailVerification }
      : {}),
    ...(emailHandlers.user ? { user: emailHandlers.user } : {}),
    plugins: [
      admin({
        defaultRole: AuthUserRole.User,
        adminRoles: [AuthUserRole.Admin]
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
        allowDynamicClientRegistration:
          project.features.oauthProvider.dynamicClientRegistration,
        allowUnauthenticatedClientRegistration: false,
        scopes: oauthConfig.scopes,
        resources: project.features.oauthProvider.enabled
          ? oauthConfig.resources(project)
          : [],
        customAccessTokenClaims: ({ user }) => ({
          ...(user === undefined
            ? oauthConfig.serviceAccessTokenClaims
            : oauthConfig.userAccessTokenClaims)
        }),
        resourceSeedMode: "overwrite",
        enforcePerClientResources: true,
        clientRegistrationDefaultScopes: oauthConfig.dynamicClientScopes,
        clientRegistrationAllowedScopes: oauthConfig.dynamicClientScopes,
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
              ipAddressHeaders: [options.trustedClientIpHeader]
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

const buildSocialProviders = (project: Realm) => {
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

const buildTelegramOidcPlugins = (project: Realm) => {
  const settings = project.socialProviders[SocialProvider.Telegram];
  if (
    !settings.enabled ||
    !isSocialProviderConfigured(SocialProvider.Telegram, settings)
  ) {
    return [];
  }

  return [createTelegramOidcPlugin(settings)];
};
