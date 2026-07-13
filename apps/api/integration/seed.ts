import {
  BillingEnvironment,
  BillingProvider,
  DEFAULT_PROJECT_FEATURES,
  DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  DEFAULT_PROJECT_STORAGE,
  type AuthProject,
  type BillingEntitlement,
  type BillingProductMapping
} from "../src/config/projects";
import { integrationAdminDbOptions, integrationEncryptionSecret } from "./setup";
import { updateBillingSettings } from "../src/modules/billing/store";
import { createProjectSettings } from "../src/modules/projects/store";

export const seedIntegrationRealm = async (options: {
  slug: string;
  schema: string;
  name: string;
  oauthProvider?: {
    enabled: boolean;
    dynamicClientRegistration?: boolean;
  };
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
    project,
    encryptionSecret: integrationEncryptionSecret,
    patch: project.billing
  });

  return {
    ...project,
    billing
  };
};
