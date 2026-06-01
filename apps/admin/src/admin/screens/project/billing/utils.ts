import type { BillingSettings } from "../../../types";

export function settingsToForm(settings: BillingSettings) {
  return {
    provider: settings.provider,
    enabled: settings.enabled && settings.provider === "polar",
    environment: settings.environment,
    organizationId: "",
    accessToken: "",
    webhookSecret: "",
    accessTokenConfigured: settings.accessTokenConfigured,
    freeEntitlements: (settings.freeEntitlements ?? []).map((entitlement) => ({
      ...entitlement
    })),
    products: settings.products.map((product) => ({
      ...product,
      entitlements: product.entitlements.map((entitlement) => ({ ...entitlement }))
    }))
  };
}

export function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

export function catalogLabel<T extends string>(
  options: Array<{ value: T; label: string }>,
  value: T
) {
  return options.find((option) => option.value === value)?.label ?? value;
}
