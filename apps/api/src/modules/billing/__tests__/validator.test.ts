import { describe, expect, test } from "bun:test";

import {
  parseBillingSettingsPatch,
  parseCreatePolarProduct
} from "../validator";

describe("billing validators", () => {
  test("parses a Polar billing settings patch", () => {
    expect(
      parseBillingSettingsPatch({
        provider: "polar",
        enabled: true,
        environment: "sandbox",
        organizationId: " org_123 ",
        products: [
          {
            slug: "ai-pack",
            name: "AI Pack",
            description: "50 requests",
            productId: "prod_123",
            type: "credit_pack",
            active: true,
            entitlements: [
              {
                key: "ai_request_credits",
                grantType: "one_time_credits",
                amount: 50,
                resetPeriod: "never",
                priority: 100
              }
            ]
          }
        ]
      })
    ).toMatchObject({
      provider: "polar",
      enabled: true,
      organizationId: "org_123",
      products: [
        {
          slug: "ai-pack",
          entitlements: [
            {
              key: "ai_request_credits",
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
        type: "credit_pack",
        priceAmount: 1000,
        priceCurrency: "EUR",
        recurringInterval: "month"
      })
    ).toEqual({
      slug: "ai-pack",
      name: "AI Pack",
      description: "50 requests",
      type: "credit_pack",
      priceAmount: 1000,
      priceCurrency: "eur",
      recurringInterval: "month"
    });
  });

  test("rejects invalid billing setting enum values", () => {
    const base = {
      provider: "polar",
      enabled: true,
      environment: "sandbox",
      products: [
        {
          slug: "ai-pack",
          name: "AI Pack",
          description: "50 requests",
          productId: "prod_123",
          type: "credit_pack",
          active: true,
          entitlements: [
            {
              key: "ai_request_credits",
              grantType: "one_time_credits",
              amount: 50,
              resetPeriod: "never",
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
});
