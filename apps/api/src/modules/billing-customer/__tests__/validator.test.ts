import { describe, expect, test } from "bun:test";

import { parseCreateCheckout } from "../validator";

describe("billing customer input", () => {
  test("accepts only one normalized product slug", () => {
    expect(parseCreateCheckout({ slug: "  pro-monthly  " })).toEqual({
      slug: "pro-monthly"
    });
    expect(parseCreateCheckout({ slug: "pro", productId: "hidden" })).toBeNull();
    expect(parseCreateCheckout({ slug: " " })).toBeNull();
  });
});
