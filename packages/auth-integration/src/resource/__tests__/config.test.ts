import { describe, expect, test } from "bun:test";

import {
  AuthPlatformResource,
  AuthPlatformResourceScope,
  authPlatformResourceIdentifier,
  authPlatformResourceMetadataUrl,
  authPlatformResourceScopes
} from "../config";

describe("auth platform resource conventions", () => {
  test("builds the canonical billing audience from the realm issuer", () => {
    expect(
      authPlatformResourceIdentifier(
        "https://auth.example.com/api/demo/",
        AuthPlatformResource.Billing
      )
    ).toBe("https://auth.example.com/api/demo/billing");
    expect(
      authPlatformResourceMetadataUrl(
        "https://auth.example.com/api/demo",
        AuthPlatformResource.Billing
      )
    ).toBe(
      "https://auth.example.com/.well-known/oauth-protected-resource/api/demo/billing"
    );
    expect(authPlatformResourceScopes(AuthPlatformResource.Billing)).toEqual([
      AuthPlatformResourceScope.BillingUsageRead,
      AuthPlatformResourceScope.BillingUsageWrite
    ]);
  });

  test("rejects a malformed realm issuer before building resource URLs", () => {
    expect(() =>
      authPlatformResourceIdentifier(
        "not-an-issuer",
        AuthPlatformResource.Storage
      )
    ).toThrow("issuer must be an absolute URI");
  });
});
