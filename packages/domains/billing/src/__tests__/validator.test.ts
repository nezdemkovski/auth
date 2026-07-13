import { describe, expect, test } from "bun:test";

import {
  BillingEnvironment,
  BillingProductType,
  BillingProvider,
  BillingRecurringInterval,
  EntitlementGrantType,
  EntitlementResetPeriod
} from "../model";
import {
  parseBillingSettingsPatch,
  parseCreatePolarProduct,
  validateBillingSettingsPatch
} from "../validator";

describe("billing validators", () => {
  test("parses a Polar billing settings patch", () => {
    expect(
      parseBillingSettingsPatch({
        provider: BillingProvider.Polar,
        enabled: true,
        environment: BillingEnvironment.Sandbox,
        organizationId: " org_123 ",
        products: [
          {
            slug: "ai-pack",
            name: "AI Pack",
            description: "50 requests",
            productId: "prod_123",
            type: BillingProductType.CreditPack,
            active: true,
            entitlements: [
              {
                key: "credit_units",
                grantType: EntitlementGrantType.OneTimeCredits,
                amount: 50,
                resetPeriod: EntitlementResetPeriod.Never,
                priority: 100
              }
            ]
          }
        ]
      })
    ).toMatchObject({
      provider: BillingProvider.Polar,
      enabled: true,
      organizationId: "org_123",
      products: [
        {
          slug: "ai-pack",
          entitlements: [
            {
              key: "credit_units",
              amount: 50
            }
          ]
        }
      ]
    });
  });

  test("parses a Polar product creation request", () => {
    expect(
      parseCreatePolarProduct({
        slug: "ai-pack",
        name: "AI Pack",
        description: "50 requests",
        type: BillingProductType.CreditPack,
        priceAmount: 1000,
        priceCurrency: "EUR",
        recurringInterval: BillingRecurringInterval.Month
      })
    ).toEqual({
      slug: "ai-pack",
      name: "AI Pack",
      description: "50 requests",
      type: BillingProductType.CreditPack,
      priceAmount: 1000,
      priceCurrency: "eur",
      recurringInterval: BillingRecurringInterval.Month
    });
  });

  test("rejects invalid billing setting enum values", () => {
    const base = {
      provider: BillingProvider.Polar,
      enabled: true,
      environment: BillingEnvironment.Sandbox,
      products: [
        {
          slug: "ai-pack",
          name: "AI Pack",
          description: "50 requests",
          productId: "prod_123",
          type: BillingProductType.CreditPack,
          active: true,
          entitlements: [
            {
              key: "credit_units",
              grantType: EntitlementGrantType.OneTimeCredits,
              amount: 50,
              resetPeriod: EntitlementResetPeriod.Never,
              priority: 100
            }
          ]
        }
      ]
    };

    expect(parseBillingSettingsPatch({ ...base, provider: "stripe" })).toBeNull();
    expect(parseBillingSettingsPatch({ ...base, environment: "live" })).toBeNull();
    expect(
      parseBillingSettingsPatch({
        ...base,
        products: [{ ...base.products[0], type: "unknown" }]
      })
    ).toBeNull();
    expect(
      parseBillingSettingsPatch({
        ...base,
        products: [
          {
            ...base.products[0],
            entitlements: [
              {
                ...base.products[0].entitlements[0],
                grantType: "bad"
              }
            ]
          }
        ]
      })
    ).toBeNull();
    expect(
      parseBillingSettingsPatch({
        ...base,
        products: [
          {
            ...base.products[0],
            entitlements: [
              {
                ...base.products[0].entitlements[0],
                resetPeriod: "weekly"
              }
            ]
          }
        ]
      })
    ).toBeNull();
  });

  test("rejects active checkout products without entitlements", () => {
    const patch = parseBillingSettingsPatch({
      provider: BillingProvider.Polar,
      enabled: true,
      environment: BillingEnvironment.Sandbox,
      products: [
        {
          slug: "credit-pack",
          name: "Credit Pack",
          description: "",
          productId: "prod_123",
          type: BillingProductType.CreditPack,
          active: true,
          entitlements: []
        }
      ]
    });

    expect(() => patch && validateBillingSettingsPatch(patch)).toThrow(
      "At least one entitlement is required: credit-pack"
    );
  });
});
