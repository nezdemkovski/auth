import { describe, expect, test } from "bun:test";

import { polarWebhookEventKey } from "../webhooks";

describe("billing webhooks", () => {
  test("builds a stable idempotency key from event type, resource, and timestamp", () => {
    expect(
      polarWebhookEventKey(
        {
          type: "order.paid",
          timestamp: new Date("2026-06-01T12:00:00.000Z")
        },
        "order_123"
      )
    ).toBe("order.paid:order_123:2026-06-01T12:00:00.000Z");
  });
});
