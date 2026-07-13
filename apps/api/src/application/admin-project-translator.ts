import {
  isSocialProviderConfigured,
  SOCIAL_PROVIDER_CATALOG
} from "@nezdemkovski/auth-realm";

import { ADMIN_PROJECT_SLUG, type AuthProject } from "../config/projects";
import { socialProviderCallbackUrl } from "../modules/projects/translator";

export type AdminProjectIdentityCounts = {
  userCount: number;
  activeSessionCount: number;
};

const EMPTY_IDENTITY_COUNTS: AdminProjectIdentityCounts = {
  userCount: 0,
  activeSessionCount: 0
};

export const adminProjectResponse = (
  project: AuthProject,
  identityCounts: AdminProjectIdentityCounts = EMPTY_IDENTITY_COUNTS,
  publicBaseUrl = ""
) => {
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
        callbackUrl: socialProviderCallbackUrl(
          publicBaseUrl,
          project,
          provider.id
        )
      };
    }),
    system: project.slug === ADMIN_PROJECT_SLUG,
    ...identityCounts
  };
};
