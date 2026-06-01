import { describe, expect, test } from "bun:test";

import {
  BillingEnvironment,
  BillingProductType,
  BillingProvider,
  EntitlementGrantType,
  EntitlementResetPeriod,
  DEFAULT_PROJECT_FEATURES,
  DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  DEFAULT_PROJECT_STORAGE,
  type AuthProject,
  type BillingEntitlement,
  type BillingProductMapping
} from "../../../config/projects";
import { billingSettingsResponse } from "../translator";

const creditBenefit = (input: Partial<BillingEntitlement> = {}) => {
  return {
    key: "usage_units",
    grantType: EntitlementGrantType.OneTimeCredits,
    amount: 50,
    resetPeriod: EntitlementResetPeriod.Never,
    priority: 80,
    ...input
  };
};

const product = (input: Partial<BillingProductMapping> = {}) => {
  return {
    slug: "credit-pack",
    name: "Credit Pack",
    description: "",
    productId: "prod_123",
    type: BillingProductType.CreditPack,
    active: true,
    entitlements: [creditBenefit()],
    ...input
  };
};

const project: AuthProject = {
  slug: "demo",
  name: "Demo",
  schema: "demo_auth",
  description: "",
  iconUrl: "",
  appUrl: "https://demo.example.com",
  trustedOrigins: ["https://demo.example.com"],
  features: DEFAULT_PROJECT_FEATURES,
  socialProviders: DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  billing: {
    provider: BillingProvider.Polar,
    enabled: true,
    environment: BillingEnvironment.Sandbox,
    organizationId: "",
    accessToken: "",
    webhookSecret: "",
    products: [],
    freeEntitlements: []
  },
  storage: DEFAULT_PROJECT_STORAGE
};

describe("billing translator", () => {
  test("returns server-side benefit presets and starter grant suggestions from product entitlements", () => {
    const response = billingSettingsResponse({
      project,
      publicBaseUrl: "https://auth.example.com",
      settings: {
        provider: BillingProvider.Polar,
        enabled: true,
        environment: BillingEnvironment.Sandbox,
        organizationId: "",
        accessTokenConfigured: true,
        webhookSecretConfigured: true,
        products: [
          product({
            entitlements: [
              creditBenefit({
                key: " usage_units ",
                amount: 50,
                priority: 40
              }),
              creditBenefit({
                key: "usage_units",
                amount: 100,
                priority: 10
              }),
              creditBenefit({
                key: "exports",
                grantType: EntitlementGrantType.RecurringQuota,
                resetPeriod: EntitlementResetPeriod.Monthly,
                amount: 20
              })
            ]
          })
        ],
        freeEntitlements: []
      }
    });

    expect(response.benefitPresets).toEqual([
      {
        key: "usage_units",
        grantType: EntitlementGrantType.OneTimeCredits,
        amount: 50,
        resetPeriod: EntitlementResetPeriod.Never,
        priority: 40
      },
      {
        key: "exports",
        grantType: EntitlementGrantType.RecurringQuota,
        amount: 20,
        resetPeriod: EntitlementResetPeriod.Monthly,
        priority: 80
      }
    ]);
    expect(response.starterGrantSuggestion).toEqual({
      key: "usage_units",
      grantType: EntitlementGrantType.OneTimeCredits,
      amount: 5,
      resetPeriod: EntitlementResetPeriod.Never,
      priority: 40
    });
  });

  test.each([
    {
      grantType: EntitlementGrantType.Boolean,
      productAmount: null,
      suggestedAmount: null,
      resetPeriod: EntitlementResetPeriod.Never
    },
    {
      grantType: EntitlementGrantType.Lifetime,
      productAmount: null,
      suggestedAmount: null,
      resetPeriod: EntitlementResetPeriod.Never
    },
    {
      grantType: EntitlementGrantType.OneTimeCredits,
      productAmount: 50,
      suggestedAmount: 5,
      resetPeriod: EntitlementResetPeriod.Never
    },
    {
      grantType: EntitlementGrantType.RecurringQuota,
      productAmount: 50,
      suggestedAmount: 5,
      resetPeriod: EntitlementResetPeriod.Monthly
    },
    {
      grantType: EntitlementGrantType.Metered,
      productAmount: 50,
      suggestedAmount: 5,
      resetPeriod: EntitlementResetPeriod.Never
    }
  ])(
    "builds a starter grant suggestion for $grantType product benefits",
    ({ grantType, productAmount, suggestedAmount, resetPeriod }) => {
      const response = billingSettingsResponse({
        project,
        publicBaseUrl: "https://auth.example.com",
        settings: {
          provider: BillingProvider.Polar,
          enabled: true,
          environment: BillingEnvironment.Sandbox,
          organizationId: "",
          accessTokenConfigured: true,
          webhookSecretConfigured: true,
          products: [
            product({
              entitlements: [
                creditBenefit({
                  key: "premium",
                  grantType,
                  amount: productAmount,
                  resetPeriod
                })
              ]
            })
          ],
          freeEntitlements: []
        }
      });

      expect(response.starterGrantSuggestion).toEqual({
        key: "premium",
        grantType,
        amount: suggestedAmount,
        resetPeriod,
        priority: 80
      });
    }
  );

  test("returns a generic starter suggestion when no product benefits exist", () => {
    const response = billingSettingsResponse({
      project,
      publicBaseUrl: "https://auth.example.com",
      settings: {
        provider: BillingProvider.Polar,
        enabled: true,
        environment: BillingEnvironment.Sandbox,
        organizationId: "",
        accessTokenConfigured: true,
        webhookSecretConfigured: true,
        products: [],
        freeEntitlements: []
      }
    });

    expect(response.starterGrantSuggestion).toEqual({
      key: "",
      grantType: EntitlementGrantType.OneTimeCredits,
      amount: 5,
      resetPeriod: EntitlementResetPeriod.Never,
      priority: 100
    });
  });
});
