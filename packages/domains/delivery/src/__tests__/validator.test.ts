import { describe, expect, test } from "bun:test";

import { EmailProvider } from "../sender";
import { parseDeliverySettingsPatch } from "../validator";

describe("delivery validator", () => {
  test("parses and trims delivery settings", () => {
    expect(
      parseDeliverySettingsPatch({
        provider: EmailProvider.Resend,
        from: " Auth <auth@example.com> ",
        cloudflareAccountId: " ",
        resendApiKey: " re_123 "
      })
    ).toEqual({
      provider: EmailProvider.Resend,
      from: "Auth <auth@example.com>",
      cloudflareAccountId: "",
      resendApiKey: "re_123"
    });
  });

  test("rejects malformed delivery settings", () => {
    expect(
      parseDeliverySettingsPatch({
        provider: EmailProvider.Cloudflare,
        from: "Auth <auth@example.com>"
      })
    ).toBeNull();
  });
});
