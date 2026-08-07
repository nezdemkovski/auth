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
        }),
        removeProject: async () => {}
      },
      "https://auth.example.com",
      () => {}
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

  test("quarantines a failing realm while continuing to reconcile others", async () => {
    const failures: Array<{
      projectSlug: string;
      clientId: string | null;
      message: string;
    }> = [];
    const removedProjects: string[] = [];
    const updates: string[] = [];
    const legacyProject = {
      slug: "legacy",
      appUrl: "",
      features: { oauthProvider: { enabled: true } }
    };
    const demoProject = {
      slug: "demo",
      appUrl: "https://demo.example.com",
      features: { oauthProvider: { enabled: true } }
    };

    await reconcileApplicationConnections(
      {
        list: () => [legacyProject, demoProject],
        get: (slug) => {
          const project =
            slug === legacyProject.slug ? legacyProject : demoProject;
          return {
            project,
            auth: {
              oauthClientManagement: {
                list: async () => [
                  {
                    clientId: `${slug}-client`,
                    name: "Demo App",
                    profile: OAuthClientProfile.Public,
                    skipConsent: true,
                    redirectUris: ["https://old.example.com/auth/callback"],
                    postLogoutRedirectUris: ["https://old.example.com"],
                    scopes: [OAuthScope.OpenId],
                    resources: []
                  }
                ],
                update: async (clientId) => {
                  if (slug === legacyProject.slug) {
                    throw new Error("[body.update.redirectUris.0] Invalid URL");
                  }
                  updates.push(clientId);
                }
              }
            }
          };
        },
        removeProject: async (slug) => {
          removedProjects.push(slug);
        }
      },
      "https://auth.example.com",
      (failure) => {
        failures.push({
          projectSlug: failure.projectSlug,
          clientId: failure.clientId,
          message:
            failure.error instanceof Error
              ? failure.error.message
              : String(failure.error)
        });
      }
    );

    expect(failures).toEqual([
      {
        projectSlug: "legacy",
        clientId: "legacy-client",
        message: "[body.update.redirectUris.0] Invalid URL"
      }
    ]);
    expect(removedProjects).toEqual(["legacy"]);
    expect(updates).toEqual(["demo-client"]);
  });
});
