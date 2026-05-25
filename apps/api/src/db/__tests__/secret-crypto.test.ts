import { describe, expect, test } from "bun:test";

import {
  decryptSecretValue,
  encryptSecretValue
} from "../secret-crypto";

describe("secret crypto", () => {
  test("encrypts with authenticated context", async () => {
    const secret = "x".repeat(32);
    const cipher = await encryptSecretValue("value", secret, "delivery:resend");

    expect(cipher).toMatch(/^v1:/);
    expect(cipher).not.toContain("value");
    expect(await decryptSecretValue(cipher, secret, "delivery:resend")).toBe("value");
    await expect(
      decryptSecretValue(cipher, secret, "delivery:cloudflare")
    ).rejects.toThrow();
    await expect(
      decryptSecretValue(cipher, "y".repeat(32), "delivery:resend")
    ).rejects.toThrow();
  });
});
