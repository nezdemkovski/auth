import type { Product } from "@polar-sh/sdk/models/components/product";

import type { BillingSettingsPatch } from "./store";
import type { CreatePolarProductInput } from "./validator";

type BillingProductType = CreatePolarProductInput["type"];

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
  input: CreatePolarProductInput
): BillingSettingsPatch["products"][number] {
  return {
    slug: input.slug,
    name: product.name,
    description: product.description ?? "",
    productId: product.id,
    type: input.type,
    active: true,
    entitlements: defaultEntitlementsForBillingProduct(input.type)
  };
}

function defaultEntitlementsForBillingProduct(
  type: BillingProductType
): BillingSettingsPatch["products"][number]["entitlements"] {
  if (type === "subscription") {
    return [
      {
        key: "ai_requests",
        grantType: "recurring_quota",
        amount: 100,
        resetPeriod: "monthly",
        priority: 100
      }
    ];
  }
  if (type === "credit_pack") {
    return [
      {
        key: "ai_request_credits",
        grantType: "one_time_credits",
        amount: 100,
        resetPeriod: "never",
        priority: 100
      }
    ];
  }

  return [
    {
      key: "access",
      grantType: type === "lifetime" ? "lifetime" : "boolean",
      amount: null,
      resetPeriod: "never",
      priority: 100
    }
  ];
}
