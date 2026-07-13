import type { AuthProject } from "../../config/projects";
import {
  SOCIAL_PROVIDER_CATALOG,
  SocialProvider,
  type SocialProviderId,
  type SocialProviderSummary
} from "@nezdemkovski/auth-realm";

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
  project: Pick<AuthProject, "slug">,
  provider: SocialProviderId
) => {
  const callbackPath = provider === SocialProvider.Telegram
    ? `/oauth2/callback/${provider}`
    : `/callback/${provider}`;
  return `${publicBaseUrl}/api/${project.slug}/auth${callbackPath}`;
};
