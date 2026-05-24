import {
  BillingProductType,
  EntitlementGrantType,
  EntitlementResetPeriod,
  type BillingProductMapping
} from "../../config/projects";
import type { CreatePolarProductInput } from "./validator";

export const defaultEntitlementsForBillingProduct = (type: CreatePolarProductInput["type"]) => {
  if (type === BillingProductType.Subscription) {
    return [
      {
        key: "ai_requests",
        grantType: EntitlementGrantType.RecurringQuota,
        amount: 100,
        resetPeriod: EntitlementResetPeriod.Monthly,
        priority: 100
      }
    ];
  }
  if (type === BillingProductType.CreditPack) {
    return [
      {
        key: "ai_request_credits",
        grantType: EntitlementGrantType.OneTimeCredits,
        amount: 100,
        resetPeriod: EntitlementResetPeriod.Never,
        priority: 100
      }
    ];
  }

  return [
    {
      key: "access",
      grantType:
        type === BillingProductType.Lifetime
          ? EntitlementGrantType.Lifetime
          : EntitlementGrantType.Boolean,
      amount: null,
      resetPeriod: EntitlementResetPeriod.Never,
      priority: 100
    }
  ];
};
