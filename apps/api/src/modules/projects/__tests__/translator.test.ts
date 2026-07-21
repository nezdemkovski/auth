import { describe, expect, test } from "bun:test";
import { OAuthClientProfile } from "@nezdemkovski/auth-oauth-client-management";

import { projectSetupResponse } from "../translator";

const primaryApp = {
  client: {
    clientId: "client_demo",
    name: "Demo App app",
    profile: OAuthClientProfile.Public,
    redirectUris: ["https://demo.example.com/auth/callback"],
    postLogoutRedirectUris: ["https://demo.example.com"],
    scopes: [
      "openid",
      "profile",
      "email",
      "offline_access",
      "storage:avatar:write",
      "storage:avatar:delete",
      "billing:usage:read"
    ],
    resources: ["https://auth.example.com/api/demo/app"],
    disabled: false,
    public: true,
    skipConsent: true,
    requirePkce: true,
    secretConfigured: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z")
  },
  credential: {
    clientId: "client_demo"
  }
};

describe("realm setup response", () => {
  test("returns one canonical issuer for app login and MCP discovery", () => {
    expect(
      projectSetupResponse(
        "https://auth.example.com",
        { slug: "demo" },
        primaryApp
      )
    ).toEqual({
      issuer: "https://auth.example.com/api/demo",
      callbackUrl: "https://demo.example.com/auth/callback",
      clientId: "client_demo",
      mcp: {
        authorizationServer: "https://auth.example.com/api/demo",
        discoveryUrl:
          "https://auth.example.com/api/demo/.well-known/oauth-authorization-server"
      }
    });
  });

  test("never presents a confidential client as the app setup", () => {
    expect(() =>
      projectSetupResponse(
        "https://auth.example.com",
        { slug: "demo" },
        {
          ...primaryApp,
          credential: {
            clientId: "client_demo",
            clientSecret: "secret_demo"
          }
        }
      )
    ).toThrow("Primary app integration must be a public SPA client");
  });
});
