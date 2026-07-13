import type {
  BillingEntitlement,
  BillingProductMapping,
  ProjectBillingSettings
} from "./model";
import {
  BillingEnvironment,
  BillingProductType,
  BillingRecurringInterval,
  DEFAULT_BILLING_PRODUCT_SLUG,
  EntitlementGrantType,
  EntitlementResetPeriod,
  normalizeBillingProductSlug,
  type BillingSettingsState
} from "./model";
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
  grantTemplate: BillingEntitlement;
  catalog: BillingCatalog;
  templates: BillingTemplates;
};

type CatalogOption<T extends string> = {
  value: T;
  label: string;
};

export type BillingCatalog = {
  environments: Array<CatalogOption<BillingEnvironment>>;
  productTypes: Array<CatalogOption<BillingProductType>>;
  grantTypes: Array<CatalogOption<EntitlementGrantType>>;
  resetPeriods: Array<CatalogOption<EntitlementResetPeriod>>;
  recurringIntervals: Array<CatalogOption<BillingRecurringInterval>>;
};

export type BillingTemplates = {
  createProduct: CreatePolarProductInput;
  product: BillingProductMapping;
  entitlement: BillingEntitlement;
};

export const billingSettingsResponse = (options: {
  settings: BillingSettingsState;
  projectSlug: string;
  publicBaseUrl: string;
}) => {
  const benefitPresets = productBenefitPresets(options.settings.products);

  return {
    ...options.settings,
    webhookUrl: billingWebhookUrl(options.publicBaseUrl, options.projectSlug),
    benefitPresets,
    grantTemplate: grantTemplate(benefitPresets[0] ?? null),
    catalog: billingCatalog(),
    templates: billingTemplates()
  };
};

export const billingWebhookUrl = (publicBaseUrl: string, projectSlug: string) => {
  return `${publicBaseUrl}/api/${projectSlug}/auth/polar/webhooks`;
};

export const polarProductResponse = (product: PolarProductSummary) => {
  return {
    id: product.id,
    name: product.name,
    description: product.description ?? "",
    isRecurring: product.isRecurring,
    isArchived: product.isArchived,
    organizationId: product.organizationId,
    suggestedMapping: billingProductFromPolar(product)
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

export const billingProductFromPolar = (product: PolarProductSummary): BillingProductMapping => {
  return {
    slug: normalizeBillingProductSlug(product.name) || DEFAULT_BILLING_PRODUCT_SLUG,
    name: product.name,
    description: product.description ?? "",
    productId: product.id,
    type: product.isRecurring ? BillingProductType.Subscription : BillingProductType.OneTime,
    active: true,
    entitlements: []
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

const grantTemplate = (source: BillingEntitlement | null): BillingEntitlement => {
  if (!source) {
    return {
      key: "",
      grantType: EntitlementGrantType.OneTimeCredits,
      amount: null,
      resetPeriod: EntitlementResetPeriod.Never,
      priority: 100
    };
  }

  return {
    key: source.key,
    grantType: source.grantType,
    amount: null,
    resetPeriod: source.resetPeriod,
    priority: source.priority
  };
};

const billingTemplates = (): BillingTemplates => {
  return {
    createProduct: {
      slug: "",
      name: "",
      description: "",
      type: BillingProductType.CreditPack,
      priceAmount: 1000,
      priceCurrency: "eur",
      recurringInterval: BillingRecurringInterval.Month
    },
    product: {
      slug: "",
      name: "",
      description: "",
      productId: "",
      type: BillingProductType.Subscription,
      active: true,
      entitlements: []
    },
    entitlement: {
      key: "",
      grantType: EntitlementGrantType.OneTimeCredits,
      amount: null,
      resetPeriod: EntitlementResetPeriod.Never,
      priority: 100
    }
  };
};

const billingCatalog = (): BillingCatalog => {
  return {
    environments: [
      { value: BillingEnvironment.Sandbox, label: "Sandbox" },
      { value: BillingEnvironment.Production, label: "Production" }
    ],
    productTypes: [
      { value: BillingProductType.Subscription, label: "Subscription" },
      { value: BillingProductType.OneTime, label: "One-time" },
      { value: BillingProductType.CreditPack, label: "Credit pack" },
      { value: BillingProductType.Lifetime, label: "Lifetime" },
      { value: BillingProductType.Metered, label: "Metered" }
    ],
    grantTypes: [
      { value: EntitlementGrantType.Boolean, label: "Feature access" },
      { value: EntitlementGrantType.RecurringQuota, label: "Recurring quota" },
      { value: EntitlementGrantType.OneTimeCredits, label: "One-time credits" },
      { value: EntitlementGrantType.Lifetime, label: "Lifetime access" },
      { value: EntitlementGrantType.Metered, label: "Metered usage" }
    ],
    resetPeriods: [
      { value: EntitlementResetPeriod.Never, label: "Never" },
      { value: EntitlementResetPeriod.Monthly, label: "Monthly" },
      { value: EntitlementResetPeriod.Yearly, label: "Yearly" }
    ],
    recurringIntervals: [
      { value: BillingRecurringInterval.Month, label: "Monthly" },
      { value: BillingRecurringInterval.Year, label: "Yearly" }
    ]
  };
};
