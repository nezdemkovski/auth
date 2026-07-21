import { describe, expect, test } from "bun:test";

import {
  OAUTH_DYNAMIC_CLIENT_SCOPES,
  OAuthResource,
  OAuthScope,
  OAuthTokenKind,
  oauthResourceDefinitions,
  oauthResourceIdentifier,
  oauthResourceMetadataUrl,
  oauthResourceScopes,
  oauthTokenKindClaim
} from "../index";

describe("OAuth platform resources", () => {
  test("defines isolated audiences and least-privilege scopes", () => {
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
    expect(oauthResourceScopes(OAuthResource.Billing)).toEqual([
      OAuthScope.BillingUsageRead,
      OAuthScope.BillingUsageWrite,
      OAuthScope.BillingCheckoutCreate,
      OAuthScope.BillingPortalRead
    ]);
    expect(
      oauthResourceDefinitions("https://auth.example.com", "demo")
    ).toEqual([
      {
        identifier: "https://auth.example.com/api/demo/app",
        allowedScopes: [
          OAuthScope.OpenId,
          OAuthScope.Profile,
          OAuthScope.Email,
          OAuthScope.OfflineAccess,
          OAuthScope.StorageAvatarWrite,
          OAuthScope.StorageAvatarDelete,
          OAuthScope.BillingUsageRead,
          OAuthScope.BillingCheckoutCreate,
          OAuthScope.BillingPortalRead
        ]
      },
      {
        identifier: "https://auth.example.com/api/demo/upload",
        allowedScopes: [
          OAuthScope.StorageAvatarWrite,
          OAuthScope.StorageAvatarDelete
        ]
      },
      {
        identifier: "https://auth.example.com/api/demo/billing",
        allowedScopes: [
          OAuthScope.BillingUsageRead,
          OAuthScope.BillingUsageWrite,
          OAuthScope.BillingCheckoutCreate,
          OAuthScope.BillingPortalRead
        ]
      }
    ]);
  });

  test("builds canonical metadata and token-kind claim URLs", () => {
    expect(
      oauthResourceMetadataUrl(
        "https://auth.example.com",
        "demo",
        OAuthResource.Billing
      )
    ).toBe(
      "https://auth.example.com/.well-known/oauth-protected-resource/api/demo/billing"
    );
    expect(oauthTokenKindClaim("https://auth.example.com/path")).toBe(
      "https://auth.example.com/claims/token-kind"
    );
    expect(Object.values(OAuthTokenKind)).toEqual([
      OAuthTokenKind.User,
      OAuthTokenKind.Service
    ]);
    expect(OAUTH_DYNAMIC_CLIENT_SCOPES).toEqual([
      OAuthScope.OpenId,
      OAuthScope.Profile,
      OAuthScope.Email,
      OAuthScope.OfflineAccess
    ]);
  });
});
