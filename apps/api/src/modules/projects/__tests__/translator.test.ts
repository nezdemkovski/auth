import { describe, expect, test } from "bun:test";
import { OAuthClientProfile } from "@nezdemkovski/auth-oauth-client-management";

import { projectSetupResponse } from "../translator";

const primaryApp = {
  client: {
    clientId: "client_demo",
    name: "Demo App backend",
    profile: OAuthClientProfile.Web,
    redirectUris: [
      "https://api.demo.example.com/api/auth/oauth2/callback/auth-platform"
    ],
    postLogoutRedirectUris: ["https://demo.example.com"],
    scopes: ["openid", "profile", "email", "offline_access"],
    resources: [],
    disabled: false,
    public: false,
    skipConsent: true,
    requirePkce: true,
    secretConfigured: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z")
  },
  credential: {
    clientId: "client_demo",
    clientSecret: "secret_demo"
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
      callbackUrl:
        "https://api.demo.example.com/api/auth/oauth2/callback/auth-platform",
      clientId: "client_demo",
      clientSecret: "secret_demo",
      mcp: {
        authorizationServer: "https://auth.example.com/api/demo",
        discoveryUrl:
          "https://auth.example.com/api/demo/.well-known/oauth-authorization-server"
      }
    });
  });

  test("never presents a public client as copy-ready backend setup", () => {
    expect(() =>
      projectSetupResponse(
        "https://auth.example.com",
        { slug: "demo" },
        {
          ...primaryApp,
          credential: { clientId: "client_demo" }
        }
      )
    ).toThrow("Primary app integration must be confidential");
  });
});
