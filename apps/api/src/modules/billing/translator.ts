import type { Product } from "@polar-sh/sdk/models/components/product";

import type {
  AuthProject,
  BillingEntitlement,
  BillingProductMapping,
  ProjectBillingSettings
} from "../../config/projects";
import type { BillingSettingsState } from "./store";
import type { CreatePolarProductInput } from "./validator";

export type PublicBillingSettings = Omit<
  ProjectBillingSettings,
  "accessToken" | "webhookSecret"
> & {
  accessTokenConfigured: boolean;
  webhookSecretConfigured: boolean;
  webhookUrl: string;
};

export function billingSettingsResponse(options: {
  settings: BillingSettingsState;
  project: AuthProject;
  publicBaseUrl: string;
}): PublicBillingSettings {
  return {
    ...options.settings,
    webhookUrl: billingWebhookUrl(options.publicBaseUrl, options.project)
  };
}

export function billingWebhookUrl(publicBaseUrl: string, project: AuthProject): string {
  return `${publicBaseUrl}/api/${project.slug}/auth/polar/webhooks`;
}

export function polarProductResponse(product: Product) {
  return {
    id: product.id,
    name: product.name,
    description: product.description ?? "",
    isRecurring: product.isRecurring,
    isArchived: product.isArchived,
    organizationId: product.organizationId
  };
}

export function createdBillingProductResponse(
  product: Product,
  input: CreatePolarProductInput,
  entitlements: BillingProductMapping["entitlements"]
): BillingProductMapping {
  return {
    slug: input.slug,
    name: product.name,
    description: product.description ?? "",
    productId: product.id,
    type: input.type,
    active: true,
    entitlements
  };
}

export function normalizeBillingProducts(value: unknown): BillingProductMapping[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((product) => ({
      slug: typeof product.slug === "string" ? product.slug : "",
      name: typeof product.name === "string" ? product.name : "",
      description: typeof product.description === "string" ? product.description : "",
      productId: typeof product.productId === "string" ? product.productId : "",
      type: normalizeProductType(product.type),
      active: typeof product.active === "boolean" ? product.active : false,
      entitlements: normalizeEntitlements(product.entitlements)
    }))
    .filter((product) => product.slug);
}

function normalizeEntitlements(value: unknown): BillingEntitlement[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((entitlement) => ({
    key: typeof entitlement.key === "string" ? entitlement.key : "",
    grantType: normalizeGrantType(entitlement.grantType),
    amount:
      typeof entitlement.amount === "number" && Number.isFinite(entitlement.amount)
        ? entitlement.amount
        : null,
    resetPeriod: normalizeResetPeriod(entitlement.resetPeriod),
    priority:
      typeof entitlement.priority === "number" && Number.isFinite(entitlement.priority)
        ? entitlement.priority
        : 100
  }));
}

function normalizeProductType(value: unknown): BillingProductMapping["type"] {
  return value === "subscription" ||
    value === "one_time" ||
    value === "credit_pack" ||
    value === "lifetime" ||
    value === "metered"
    ? value
    : "one_time";
}

function normalizeGrantType(value: unknown): BillingEntitlement["grantType"] {
  return value === "boolean" ||
    value === "recurring_quota" ||
    value === "one_time_credits" ||
    value === "lifetime" ||
    value === "metered"
    ? value
    : "boolean";
}

function normalizeResetPeriod(value: unknown): BillingEntitlement["resetPeriod"] {
  return value === "monthly" || value === "yearly" || value === "never"
    ? value
    : "never";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
