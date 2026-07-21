import { describe, expect, test } from "bun:test";
import { OAuthClientProfile } from "@nezdemkovski/auth-oauth-client-management";
import { OAuthScope } from "@nezdemkovski/auth-oauth-resource";

import {
  authConnectionClientInput,
  reconcileApplicationConnections
} from "../core";
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
      redirectUris: [
        "https://demo.example.com/auth/callback",
        "demo://auth/callback"
      ],
      postLogoutRedirectUris: ["https://demo.example.com"],
      scopes: [
        OAuthScope.OpenId,
        OAuthScope.Profile,
        OAuthScope.Email,
        OAuthScope.OfflineAccess,
        OAuthScope.StorageAvatarWrite,
        OAuthScope.StorageAvatarDelete,
        OAuthScope.BillingUsageRead,
        OAuthScope.BillingCheckoutCreate,
        OAuthScope.BillingPortalRead
      ],
      resources: ["https://auth.example.com/api/demo/app"],
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

  test("upgrades an existing app client to the current realm contract", async () => {
    const updates: unknown[] = [];
    const project = {
      slug: "demo",
      appUrl: "https://demo.example.com",
      features: { oauthProvider: { enabled: true } }
    };
    await reconcileApplicationConnections(
      {
        list: () => [project],
        get: () => ({
          project,
          auth: {
            oauthClientManagement: {
              list: async () => [
                {
                  clientId: "demo-client",
                  name: "Demo App",
                  profile: OAuthClientProfile.Public,
                  skipConsent: true,
                  redirectUris: ["https://demo.example.com/auth/callback"],
                  postLogoutRedirectUris: ["https://demo.example.com"],
                  scopes: [
                    OAuthScope.OpenId,
                    OAuthScope.Profile,
                    OAuthScope.Email,
                    OAuthScope.OfflineAccess
                  ],
                  resources: []
                }
              ],
              update: async (clientId, update) => {
                updates.push({ clientId, update });
              }
            }
          }
        })
      },
      "https://auth.example.com"
    );

    expect(updates).toEqual([
      {
        clientId: "demo-client",
        update: {
          name: "Demo App",
          redirectUris: [
            "https://demo.example.com/auth/callback",
            "demo://auth/callback"
          ],
          postLogoutRedirectUris: ["https://demo.example.com"],
          scopes: [
            OAuthScope.OpenId,
            OAuthScope.Profile,
            OAuthScope.Email,
            OAuthScope.OfflineAccess,
            OAuthScope.StorageAvatarWrite,
            OAuthScope.StorageAvatarDelete,
            OAuthScope.BillingUsageRead,
            OAuthScope.BillingCheckoutCreate,
            OAuthScope.BillingPortalRead
          ],
          resources: ["https://auth.example.com/api/demo/app"],
          skipConsent: true
        }
      }
    ]);
  });
});
