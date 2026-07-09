import { describe, expect, test } from "bun:test";

import { validIdempotencyKey } from "../usage-http";

describe("billing usage HTTP validation", () => {
  test("requires bounded URL-safe idempotency keys", () => {
    expect(validIdempotencyKey("request-00000001")).toBe(true);
    expect(validIdempotencyKey("short")).toBe(false);
    expect(validIdempotencyKey("request key with spaces")).toBe(false);
    expect(validIdempotencyKey("x".repeat(129))).toBe(false);
  });
});
