import type {
  AuthProject,
  BillingEntitlement,
  BillingProductMapping,
  ProjectBillingSettings
} from "../../config/projects";
import {
  EntitlementGrantType,
  EntitlementResetPeriod
} from "../../config/projects";
import type { BillingSettingsState } from "./store";
import type { CreatePolarProductInput } from "./validator";

export type PolarProductSummary = {
  id: string;
  name: string;
  description?: string | null;
  isRecurring: boolean;
  isArchived: boolean;
  organizationId: string;
};

export type PublicBillingSettings = Omit<
  ProjectBillingSettings,
  "accessToken" | "webhookSecret"
> & {
  accessTokenConfigured: boolean;
  webhookSecretConfigured: boolean;
  webhookUrl: string;
  benefitPresets: BillingEntitlement[];
  starterGrantSuggestion: BillingEntitlement;
};

export const billingSettingsResponse = (options: {
  settings: BillingSettingsState;
  project: AuthProject;
  publicBaseUrl: string;
}) => {
  const benefitPresets = productBenefitPresets(options.settings.products);

  return {
    ...options.settings,
    webhookUrl: billingWebhookUrl(options.publicBaseUrl, options.project),
    benefitPresets,
    starterGrantSuggestion: starterGrantSuggestion(benefitPresets[0] ?? null)
  };
};

export const billingWebhookUrl = (publicBaseUrl: string, project: AuthProject) => {
  return `${publicBaseUrl}/api/${project.slug}/auth/polar/webhooks`;
};

export const polarProductResponse = (product: PolarProductSummary) => {
  return {
    id: product.id,
    name: product.name,
    description: product.description ?? "",
    isRecurring: product.isRecurring,
    isArchived: product.isArchived,
    organizationId: product.organizationId
  };
};

export const createdBillingProductResponse = (product: PolarProductSummary, input: CreatePolarProductInput, entitlements: BillingProductMapping["entitlements"]) => {
  return {
    slug: input.slug,
    name: product.name,
    description: product.description ?? "",
    productId: product.id,
    type: input.type,
    active: true,
    entitlements
  };
};

export const productBenefitPresets = (products: BillingProductMapping[]) => {
  const presets = new Map<string, BillingEntitlement>();

  for (const product of products) {
    for (const entitlement of product.entitlements) {
      const key = entitlement.key.trim();
      if (!key || presets.has(key)) {
        continue;
      }

      presets.set(key, {
        ...entitlement,
        key
      });
    }
  }

  return Array.from(presets.values());
};

const starterGrantSuggestion = (
  source: BillingEntitlement | null
): BillingEntitlement => {
  if (!source) {
    return {
      key: "",
      grantType: EntitlementGrantType.OneTimeCredits,
      amount: 5,
      resetPeriod: EntitlementResetPeriod.Never,
      priority: 100
    };
  }

  return {
    key: source.key,
    grantType: source.grantType,
    amount: starterGrantAmount(source),
    resetPeriod: source.resetPeriod,
    priority: source.priority
  };
};

const starterGrantAmount = (source: BillingEntitlement) => {
  if (
    source.grantType === EntitlementGrantType.Boolean ||
    source.grantType === EntitlementGrantType.Lifetime
  ) {
    return null;
  }

  return 5;
};
