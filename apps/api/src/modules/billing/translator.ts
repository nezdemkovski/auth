import type {
  AuthProject,
  BillingProductMapping,
  ProjectBillingSettings
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
