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

  test("classifies the first-party public client as the app connection", () => {
    const response = authConnectionResponse({
      clientId: "client_spa",
      name: "Demo App",
      profile: OAuthClientProfile.Public,
      redirectUris: ["https://demo.example.com/auth/callback"],
      postLogoutRedirectUris: ["https://demo.example.com"],
      scopes: [OAuthScope.OpenId],
      resources: ["https://auth.example.com/api/demo/app"],
      disabled: false,
      public: true,
      skipConsent: true,
      requirePkce: true,
      secretConfigured: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    });

    expect(response.kind).toBe(AuthConnectionKind.Application);
    expect(response.callbackUrl).toBe("https://demo.example.com/auth/callback");
    expect(response.canRotateCredential).toBe(false);
  });

  test("keeps consent-bound public clients and confidential web clients out of the app slot", () => {
    const base = {
      clientId: "client_other",
      name: "Other Client",
      redirectUris: ["https://other.example.com/callback"],
      postLogoutRedirectUris: [],
      scopes: [OAuthScope.OpenId],
      resources: ["https://auth.example.com/api/demo/app"],
      disabled: false,
      requirePkce: true,
      secretConfigured: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    };

    const registeredPublic = authConnectionResponse({
      ...base,
      profile: OAuthClientProfile.Public,
      public: true,
      skipConsent: false
    });
    expect(registeredPublic.kind).toBe(AuthConnectionKind.Advanced);

    const legacyWeb = authConnectionResponse({
      ...base,
      profile: OAuthClientProfile.Web,
      public: false,
      skipConsent: true,
      secretConfigured: true
    });
    expect(legacyWeb.kind).toBe(AuthConnectionKind.Advanced);
  });
});
