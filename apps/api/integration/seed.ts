import {
  BillingEnvironment,
  BillingProvider,
  updateBillingSettings,
  type BillingEntitlement,
  type BillingProductMapping
} from "@nezdemkovski/auth-billing";
import {
  DEFAULT_PROJECT_FEATURES,
  DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  type AuthProject
} from "../src/config/projects";
import { DEFAULT_PROJECT_STORAGE } from "@nezdemkovski/auth-storage";
import { integrationAdminDbOptions, integrationEncryptionSecret } from "./setup";
import { createProjectSettings } from "../src/modules/projects/store";

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
      ...DEFAULT_PROJECT_FEATURES,
      twoFactor: options.twoFactor ?? DEFAULT_PROJECT_FEATURES.twoFactor,
      oauthProvider: options.oauthProvider
        ? {
            enabled: options.oauthProvider.enabled,
            dynamicClientRegistration:
              options.oauthProvider.dynamicClientRegistration ?? false
          }
        : DEFAULT_PROJECT_FEATURES.oauthProvider
    },
    socialProviders: DEFAULT_PROJECT_SOCIAL_PROVIDERS,
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

  await createProjectSettings({
    ...integrationAdminDbOptions,
    project
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
