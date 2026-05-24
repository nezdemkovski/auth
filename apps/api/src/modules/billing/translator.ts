import type { Product } from "@polar-sh/sdk/models/components/product";

import type {
  AuthProject,
  BillingEntitlement,
  BillingProductMapping,
  ProjectBillingSettings
} from "../../config/projects";
import {
  BillingProductType,
  EntitlementGrantType,
  EntitlementResetPeriod
} from "../../config/projects";
import { isEnumValue } from "../../runtime/enums";
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

export const billingSettingsResponse = (options: {
  settings: BillingSettingsState;
  project: AuthProject;
  publicBaseUrl: string;
}) => {
  return {
    ...options.settings,
    webhookUrl: billingWebhookUrl(options.publicBaseUrl, options.project)
  };
};

export const billingWebhookUrl = (publicBaseUrl: string, project: AuthProject) => {
  return `${publicBaseUrl}/api/${project.slug}/auth/polar/webhooks`;
};

export const polarProductResponse = (product: Product) => {
  return {
    id: product.id,
    name: product.name,
    description: product.description ?? "",
    isRecurring: product.isRecurring,
    isArchived: product.isArchived,
    organizationId: product.organizationId
  };
};

export const createdBillingProductResponse = (product: Product, input: CreatePolarProductInput, entitlements: BillingProductMapping["entitlements"]) => {
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

export const normalizeBillingProducts = (value: unknown) => {
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
};

const normalizeEntitlements = (value: unknown) => {
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
};

const normalizeProductType = (value: unknown) => {
  return isEnumValue(BillingProductType, value)
    ? value
    : BillingProductType.OneTime;
};

const normalizeGrantType = (value: unknown) => {
  return isEnumValue(EntitlementGrantType, value)
    ? value
    : EntitlementGrantType.Boolean;
};

const normalizeResetPeriod = (value: unknown) => {
  return isEnumValue(EntitlementResetPeriod, value)
    ? value
    : EntitlementResetPeriod.Never;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
