import { describe, expect, test } from "bun:test";

import { EmailProvider } from "../../../email/sender";
import { toRuntimeEmailConfig } from "../translator";

describe("delivery core", () => {
  test("converts complete Resend settings to runtime email config", () => {
    expect(
      toRuntimeEmailConfig({
        provider: EmailProvider.Resend,
        from: "Auth <auth@example.com>",
        resendApiKey: "re_123",
        cloudflareAccountId: "",
        cloudflareApiToken: "",
        resendApiKeyConfigured: true,
        cloudflareApiTokenConfigured: false,
        updatedAt: null
      })
    ).toEqual({
      provider: EmailProvider.Resend,
      from: "Auth <auth@example.com>",
      apiKey: "re_123"
    });
  });

  test("falls back to disabled runtime config for incomplete settings", () => {
    expect(
      toRuntimeEmailConfig({
        provider: EmailProvider.Cloudflare,
        from: "Auth <auth@example.com>",
        cloudflareAccountId: "account",
        cloudflareApiToken: "",
        resendApiKey: "",
        cloudflareApiTokenConfigured: false,
        resendApiKeyConfigured: false,
        updatedAt: null
      })
    ).toEqual({
      provider: EmailProvider.None
    });
  });
});
