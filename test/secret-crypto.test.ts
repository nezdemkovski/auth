import { describe, expect, test } from "bun:test";

import {
  decryptSecretValue,
  encryptSecretValue
} from "../src/db/secret-crypto";

describe("secret crypto", () => {
  test("encrypts with authenticated context", () => {
    const secret = "x".repeat(32);
    const cipher = encryptSecretValue("value", secret, "delivery:resend");

    expect(cipher).toMatch(/^v1:/);
    expect(cipher).not.toContain("value");
    expect(decryptSecretValue(cipher, secret, "delivery:resend")).toBe("value");
    expect(() => decryptSecretValue(cipher, secret, "delivery:cloudflare")).toThrow();
    expect(() => decryptSecretValue(cipher, "y".repeat(32), "delivery:resend")).toThrow();
  });
});
