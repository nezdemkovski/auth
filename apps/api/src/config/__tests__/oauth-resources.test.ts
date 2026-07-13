import { describe, expect, test } from "bun:test";

import {
  OAuthResource,
  OAuthScope,
  oauthResourceDefinitions,
  oauthResourceIdentifier,
  oauthResourceMetadataUrl,
  oauthResourceScopes
} from "../oauth-resources";

describe("OAuth platform resources", () => {
  test("defines the storage audience, scope, and metadata URL from the realm", () => {
    expect(
      oauthResourceIdentifier(
        "https://auth.example.com",
        "demo",
        OAuthResource.Storage
      )
    ).toBe("https://auth.example.com/api/demo/upload");
    expect(oauthResourceScopes(OAuthResource.Storage)).toEqual([
      OAuthScope.StorageAvatarWrite,
      OAuthScope.StorageAvatarDelete
    ]);
    expect(
      oauthResourceMetadataUrl(
        "https://auth.example.com",
        "demo",
        OAuthResource.Storage
      )
    ).toBe(
      "https://auth.example.com/.well-known/oauth-protected-resource/api/demo/upload"
    );
    expect(
      oauthResourceDefinitions("https://auth.example.com", "demo")
    ).toEqual([
      {
        identifier: "https://auth.example.com/api/demo/upload",
        allowedScopes: [
          OAuthScope.StorageAvatarWrite,
          OAuthScope.StorageAvatarDelete
        ]
      },
      {
        identifier: "https://auth.example.com/api/demo/billing",
        allowedScopes: [OAuthScope.BillingUsageRead]
      }
    ]);
  });

  test("defines billing usage as a separate read-only audience", () => {
    expect(
      oauthResourceIdentifier(
        "https://auth.example.com",
        "demo",
        OAuthResource.Billing
      )
    ).toBe("https://auth.example.com/api/demo/billing");
    expect(oauthResourceScopes(OAuthResource.Billing)).toEqual([
      OAuthScope.BillingUsageRead
    ]);
    expect(
      oauthResourceMetadataUrl(
        "https://auth.example.com",
        "demo",
        OAuthResource.Billing
      )
    ).toBe(
      "https://auth.example.com/.well-known/oauth-protected-resource/api/demo/billing"
    );
  });
});
