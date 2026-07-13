import { describe, expect, test } from "bun:test";
import { ADMIN_REALM, SocialProvider } from "@nezdemkovski/auth-realm";

import { socialProviderCallbackUrl } from "../translator";

describe("social provider response mapping", () => {
  test("builds provider callback URLs under the realm auth endpoint", () => {
    expect(
      socialProviderCallbackUrl(
        "https://auth.example.com",
        ADMIN_REALM,
        SocialProvider.GitHub
      )
    ).toBe("https://auth.example.com/api/admin/auth/callback/github");
    expect(
      socialProviderCallbackUrl(
        "https://auth.example.com",
        ADMIN_REALM,
        SocialProvider.Telegram
      )
    ).toBe(
      "https://auth.example.com/api/admin/auth/oauth2/callback/telegram"
    );
  });
});
