import { describe, expect, test } from "bun:test";

import {
  BillingProductType,
  EntitlementGrantType,
  EntitlementResetPeriod
} from "../../../config/projects";
import { defaultEntitlementsForBillingProduct } from "../entitlements";

describe("billing entitlements", () => {
  test("grants monthly quotas for subscription products", () => {
    expect(
      defaultEntitlementsForBillingProduct(BillingProductType.Subscription)
    ).toEqual([
      {
        key: "ai_requests",
        grantType: EntitlementGrantType.RecurringQuota,
        amount: 100,
        resetPeriod: EntitlementResetPeriod.Monthly,
        priority: 100
      }
    ]);
  });

  test("grants one-time credits for credit pack products", () => {
    expect(
      defaultEntitlementsForBillingProduct(BillingProductType.CreditPack)
    ).toEqual([
      {
        key: "ai_request_credits",
        grantType: EntitlementGrantType.OneTimeCredits,
        amount: 100,
        resetPeriod: EntitlementResetPeriod.Never,
        priority: 100
      }
    ]);
  });

  test("grants durable access for one-time and lifetime products", () => {
    expect(
      defaultEntitlementsForBillingProduct(BillingProductType.OneTime)
    ).toEqual([
      {
        key: "access",
        grantType: EntitlementGrantType.Boolean,
        amount: null,
        resetPeriod: EntitlementResetPeriod.Never,
        priority: 100
      }
    ]);
    expect(
      defaultEntitlementsForBillingProduct(BillingProductType.Lifetime)
    ).toEqual([
      {
        key: "access",
        grantType: EntitlementGrantType.Lifetime,
        amount: null,
        resetPeriod: EntitlementResetPeriod.Never,
        priority: 100
      }
    ]);
  });
});
