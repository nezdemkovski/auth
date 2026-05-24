import type { AuthProject } from "../../config/projects";
import { SOCIAL_PROVIDER_CATALOG } from "../../config/social-providers";
import { socialProviderCallbackUrl } from "../../db/social-provider-settings";

export type ProjectCounts = {
  userCount: number;
  activeSessionCount: number;
};

const EMPTY_PROJECT_COUNTS: ProjectCounts = {
  userCount: 0,
  activeSessionCount: 0
};

export function projectResponse(
  project: AuthProject,
  counts: ProjectCounts = EMPTY_PROJECT_COUNTS,
  publicBaseUrl = ""
) {
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
        configured: Boolean(settings.clientId && settings.clientSecret),
        verifiedAt: settings.verifiedAt,
        callbackUrl: socialProviderCallbackUrl(publicBaseUrl, project, provider.id)
      };
    }),
    system: project.slug === "admin",
    ...counts
  };
}
