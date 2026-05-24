import { describe, expect, test } from "bun:test";

import { EmailProvider } from "../../../email/sender";
import { deliverySettingsResponse } from "../translator";

describe("delivery translator", () => {
  test("builds public settings without secret values", () => {
    expect(
      deliverySettingsResponse({
        provider: EmailProvider.Resend,
        from: "Auth <auth@example.com>",
        cloudflareAccountId: "",
        cloudflareApiToken: "",
        resendApiKey: "re_123",
        cloudflareApiTokenConfigured: false,
        resendApiKeyConfigured: true,
        updatedAt: "2026-05-25T10:00:00.000Z"
      })
    ).toEqual({
      provider: EmailProvider.Resend,
      from: "Auth <auth@example.com>",
      cloudflareAccountId: "",
      cloudflareApiTokenConfigured: false,
      resendApiKeyConfigured: true,
      configured: true,
      updatedAt: "2026-05-25T10:00:00.000Z"
    });
  });
});
