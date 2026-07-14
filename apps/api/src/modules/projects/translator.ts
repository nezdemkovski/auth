import type { AuthProject } from "../../config/projects";
import {
  SOCIAL_PROVIDER_CATALOG,
  SocialProvider,
  type SocialProviderId,
  type SocialProviderSummary
} from "@nezdemkovski/auth-realm";
import type { CreatedManagedOAuthClient } from "@nezdemkovski/auth-oauth-client-management";

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

export const projectSetupResponse = (
  publicBaseUrl: string,
  project: Pick<AuthProject, "slug">,
  integration: CreatedManagedOAuthClient
) => {
  const issuer = `${publicBaseUrl}/api/${project.slug}`;
  if (integration.credential.clientSecret) {
    throw new Error("Primary app integration must be a public SPA client");
  }
  return {
    issuer,
    callbackUrl: integration.client.redirectUris[0] ?? "",
    clientId: integration.credential.clientId,
    mcp: {
      authorizationServer: issuer,
      discoveryUrl: `${issuer}/.well-known/oauth-authorization-server`
    }
  };
};
