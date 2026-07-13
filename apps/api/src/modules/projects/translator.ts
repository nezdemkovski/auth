import { ADMIN_PROJECT_SLUG, type AuthProject } from "../../config/projects";
import {
  isSocialProviderConfigured,
  SOCIAL_PROVIDER_CATALOG,
  SocialProvider,
  type SocialProviderId
} from "../../config/social-providers";
import type { SocialProviderSummary } from "./social-provider-store";

export type ProjectCounts = {
  userCount: number;
  activeSessionCount: number;
};

const EMPTY_PROJECT_COUNTS: ProjectCounts = {
  userCount: 0,
  activeSessionCount: 0
};

export const projectResponse = (project: AuthProject, counts: ProjectCounts = EMPTY_PROJECT_COUNTS, publicBaseUrl = "") => {
  return {
    slug: project.slug,
    name: project.name,
    schema: project.schema,
    description: project.description,
    iconUrl: project.iconUrl,
    appUrl: project.appUrl,
    trustedOrigins: project.trustedOrigins,
    features: project.features,
    socialProviders: Object.values(SOCIAL_PROVIDER_CATALOG).map((provider) => {
      const settings = project.socialProviders[provider.id];
      return {
        provider: provider.id,
        enabled: settings.enabled,
        clientId: settings.clientId,
        configured: isSocialProviderConfigured(provider.id, settings),
        verifiedAt: settings.verifiedAt,
        callbackUrl: socialProviderCallbackUrl(publicBaseUrl, project, provider.id)
      };
    }),
    system: project.slug === ADMIN_PROJECT_SLUG,
    ...counts
  };
};

export const socialProvidersResponse = (
  project: AuthProject,
  providers: SocialProviderSummary[],
  publicBaseUrl: string
) => {
  return {
    providers: providers.map((provider) => ({
      ...provider,
      callbackUrl: socialProviderCallbackUrl(
        publicBaseUrl,
        project,
        provider.provider
      )
    })),
    catalog: Object.values(SOCIAL_PROVIDER_CATALOG)
  };
};

export const socialProviderCallbackUrl = (
  publicBaseUrl: string,
  project: AuthProject,
  provider: SocialProviderId
) => {
  const callbackPath = provider === SocialProvider.Telegram
    ? `/oauth2/callback/${provider}`
    : `/callback/${provider}`;
  return `${publicBaseUrl}/api/${project.slug}/auth${callbackPath}`;
};
