import { describe, expect, test } from "bun:test";
import { OAuthClientProfile } from "@nezdemkovski/auth-oauth-client-management";
import { OAuthScope } from "@nezdemkovski/auth-oauth-resource";

import { authConnectionClientInput } from "../core";
import { AuthConnectionKind, ServicePermission } from "../model";

const registeredProject = {
  project: {
    slug: "demo",
    appUrl: "https://demo.example.com"
  }
};

describe("authentication connection policy", () => {
  test("derives the complete Better Auth policy for SPA app login", () => {
    expect(
      authConnectionClientInput(
        {
          kind: AuthConnectionKind.Application,
          name: "Demo App",
          appUrl: "https://demo.example.com"
        },
        registeredProject,
        "https://auth.example.com"
      )
    ).toEqual({
      name: "Demo App",
      profile: OAuthClientProfile.Public,
      redirectUris: ["https://demo.example.com/auth/callback"],
      postLogoutRedirectUris: ["https://demo.example.com"],
      scopes: [
        OAuthScope.OpenId,
        OAuthScope.Profile,
        OAuthScope.Email,
        OAuthScope.OfflineAccess
      ],
      resources: [],
      skipConsent: true
    });
  });

  test("maps a service capability to its server-owned scope and resource", () => {
    expect(
      authConnectionClientInput(
        {
          kind: AuthConnectionKind.Service,
          name: "Demo Worker",
          permissions: [ServicePermission.BillingUsageWrite]
        },
        registeredProject,
        "https://auth.example.com"
      )
    ).toEqual({
      name: "Demo Worker",
      profile: OAuthClientProfile.Service,
      redirectUris: [],
      postLogoutRedirectUris: [],
      scopes: [OAuthScope.BillingUsageWrite],
      resources: ["https://auth.example.com/api/demo/billing"],
      skipConsent: true
    });
  });
});
