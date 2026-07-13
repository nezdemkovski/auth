export enum BillingProvider {
  None = "none",
  Polar = "polar"
}

export enum BillingEnvironment {
  Sandbox = "sandbox",
  Production = "production"
}

export enum BillingProductType {
  Subscription = "subscription",
  OneTime = "one_time",
  CreditPack = "credit_pack",
  Lifetime = "lifetime",
  Metered = "metered"
}

export enum BillingRecurringInterval {
  Month = "month",
  Year = "year"
}

export enum EntitlementGrantType {
  Boolean = "boolean",
  RecurringQuota = "recurring_quota",
  OneTimeCredits = "one_time_credits",
  Lifetime = "lifetime",
  Metered = "metered"
}

export enum EntitlementResetPeriod {
  Never = "never",
  Monthly = "monthly",
  Yearly = "yearly"
}

export type BillingEntitlement = {
  key: string;
  grantType: EntitlementGrantType;
  amount: number | null;
  resetPeriod: EntitlementResetPeriod;
  priority: number;
};

export type BillingProductMapping = {
  slug: string;
  name: string;
  description: string;
  productId: string;
  type: BillingProductType;
  active: boolean;
  entitlements: BillingEntitlement[];
};

export type ProjectBillingSettings = {
  provider: BillingProvider;
  enabled: boolean;
  environment: BillingEnvironment;
  organizationId: string;
  accessToken: string;
  webhookSecret: string;
  freeEntitlements: BillingEntitlement[];
  products: BillingProductMapping[];
};

export type BillingRealm = {
  slug: string;
  billing: ProjectBillingSettings;
};

export type BillingSettingsState = Omit<
  ProjectBillingSettings,
  "accessToken" | "webhookSecret"
> & {
  accessTokenConfigured: boolean;
  webhookSecretConfigured: boolean;
};

export const DEFAULT_PROJECT_BILLING: ProjectBillingSettings = {
  provider: BillingProvider.None,
  enabled: false,
  environment: BillingEnvironment.Sandbox,
  organizationId: "",
  accessToken: "",
  webhookSecret: "",
  freeEntitlements: [],
  products: []
};

export const DEFAULT_BILLING_PRODUCT_SLUG = "product";

export const cloneDefaultBilling = () => ({
  ...DEFAULT_PROJECT_BILLING,
  freeEntitlements: [],
  products: []
});

export const normalizeBillingProductSlug = (value: string) => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
};
