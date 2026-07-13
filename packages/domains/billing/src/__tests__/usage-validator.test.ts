import { describe, expect, test } from "bun:test";

import {
  BillingUsageMutation,
  parseBillingUsageMutationInput,
  validBillingUsageIdempotencyKey
} from "../usage-validator";

describe("billing usage input boundary", () => {
  test("requires a bounded URL-safe idempotency key for credit mutations", () => {
    expect(validBillingUsageIdempotencyKey("request-00000001")).toBe(true);
    expect(validBillingUsageIdempotencyKey("short")).toBe(false);
    expect(validBillingUsageIdempotencyKey("request key with spaces")).toBe(false);
    expect(validBillingUsageIdempotencyKey("x".repeat(129))).toBe(false);
  });

  test("requires an explicit normalized subject for service mutations", () => {
    expect(
      parseBillingUsageMutationInput({
        operation: BillingUsageMutation.Reserve,
        body: {
          subject: "  user_demo  ",
          key: "demo_credits",
          amount: 2
        },
        idempotencyKey: "request-00000001"
      })
    ).toEqual({
      operation: BillingUsageMutation.Reserve,
      subject: "user_demo",
      key: "demo_credits",
      amount: 2,
      idempotencyKey: "request-00000001"
    });
    expect(
      parseBillingUsageMutationInput({
        operation: BillingUsageMutation.Reserve,
        body: { key: "demo_credits" },
        idempotencyKey: "request-00000001"
      })
    ).toBeNull();
  });
});
