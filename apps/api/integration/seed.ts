import {
  BillingEnvironment,
  BillingProvider,
  updateBillingSettings,
  type BillingEntitlement,
  type BillingProductMapping
} from "@nezdemkovski/auth-billing";
import {
  createRealmSettings,
  DEFAULT_REALM_FEATURES,
  DEFAULT_REALM_SOCIAL_PROVIDERS
} from "@nezdemkovski/auth-realm";
import { DEFAULT_PROJECT_STORAGE } from "@nezdemkovski/auth-storage";

import type { AuthProject } from "../src/config/projects";
import { integrationAdminDbOptions, integrationEncryptionSecret } from "./setup";

export const seedIntegrationRealm = async (options: {
  slug: string;
  schema: string;
  name: string;
  oauthProvider?: {
    enabled: boolean;
    dynamicClientRegistration?: boolean;
  };
  twoFactor?: AuthProject["features"]["twoFactor"];
  freeEntitlements?: BillingEntitlement[];
  products?: BillingProductMapping[];
}) => {
  const project: AuthProject = {
    slug: options.slug,
    name: options.name,
    schema: options.schema,
    description: "",
    iconUrl: "",
    appUrl: `https://${options.slug}.integration.test`,
    trustedOrigins: [`https://${options.slug}.integration.test`],
    features: {
      ...DEFAULT_REALM_FEATURES,
      twoFactor: options.twoFactor ?? DEFAULT_REALM_FEATURES.twoFactor,
      oauthProvider: options.oauthProvider
        ? {
            enabled: options.oauthProvider.enabled,
            dynamicClientRegistration:
              options.oauthProvider.dynamicClientRegistration ?? false
          }
        : DEFAULT_REALM_FEATURES.oauthProvider
    },
    socialProviders: DEFAULT_REALM_SOCIAL_PROVIDERS,
    billing: {
      provider: BillingProvider.Polar,
      enabled: true,
      environment: BillingEnvironment.Sandbox,
      organizationId: "",
      accessToken: "",
      webhookSecret: "",
      freeEntitlements: options.freeEntitlements ?? [],
      products: options.products ?? []
    },
    storage: DEFAULT_PROJECT_STORAGE
  };

  await createRealmSettings({
    ...integrationAdminDbOptions,
    realm: project
  });

  const billing = await updateBillingSettings({
    ...integrationAdminDbOptions,
    projectSlug: project.slug,
    encryptionSecret: integrationEncryptionSecret,
    patch: project.billing
  });

  return {
    ...project,
    billing
  };
};
