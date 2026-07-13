import { describe, expect, test } from "bun:test";
import { OAuthClientProfile } from "@nezdemkovski/auth-oauth-client-management";
import { OAuthScope } from "@nezdemkovski/auth-oauth-resource";

import { AuthConnectionKind, ServicePermission } from "../model";
import { authConnectionResponse } from "../translator";

describe("authentication connection response", () => {
  test("exposes product intent without leaking protocol controls", () => {
    const response = authConnectionResponse({
      clientId: "client_demo",
      name: "Demo Worker",
      profile: OAuthClientProfile.Service,
      redirectUris: [],
      postLogoutRedirectUris: [],
      scopes: [OAuthScope.BillingUsageWrite],
      resources: ["https://auth.example.com/api/demo/billing"],
      disabled: false,
      public: false,
      skipConsent: true,
      requirePkce: false,
      secretConfigured: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z")
    });

    expect(response).toEqual({
      clientId: "client_demo",
      name: "Demo Worker",
      kind: AuthConnectionKind.Service,
      callbackUrl: null,
      permissions: [ServicePermission.BillingUsageWrite],
      disabled: false,
      canRotateCredential: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z"
    });
    expect(response).not.toHaveProperty("profile");
    expect(response).not.toHaveProperty("scopes");
    expect(response).not.toHaveProperty("resources");
    expect(response).not.toHaveProperty("skipConsent");
  });
});
