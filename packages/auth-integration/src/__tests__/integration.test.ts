import { describe, expect, test } from "bun:test";

import {
  AuthPlatformScope,
  createAuthPlatformProvider,
  readAuthPlatformIdentity
} from "../index";

describe("Better Auth platform integration", () => {
  test("creates a strict confidential Generic OAuth provider configuration", () => {
    const provider = createAuthPlatformProvider({
      issuer: "https://auth.example.com/api/demo/",
      clientId: "demo-client",
      clientSecret: "demo-secret",
      resource: "https://api.demo.example.com/"
    });

    expect(provider).toMatchObject({
      providerId: "auth-platform",
      discoveryUrl:
        "https://auth.example.com/api/demo/.well-known/openid-configuration",
      clientId: "demo-client",
      clientSecret: "demo-secret",
      authentication: "basic",
      scopes: [
        AuthPlatformScope.OpenId,
        AuthPlatformScope.Profile,
        AuthPlatformScope.Email,
        AuthPlatformScope.OfflineAccess
      ],
      pkce: true,
      authorizationUrlParams: {
        resource: "https://api.demo.example.com"
      },
      tokenUrlParams: {
        resource: "https://api.demo.example.com"
      }
    });
  });

  test("keeps OpenID identity scope when product scopes are customized", () => {
    const provider = createAuthPlatformProvider({
      issuer: "https://auth.example.com/api/demo",
      clientId: "demo-client",
      clientSecret: "demo-secret",
      scopes: ["profile", "demo:read", "profile"]
    });

    expect(provider.scopes).toEqual([
      AuthPlatformScope.OpenId,
      AuthPlatformScope.Profile,
      "demo:read"
    ]);
  });

  test("rejects malformed protocol configuration before Better Auth starts", () => {
    expect(() =>
      createAuthPlatformProvider({
        issuer: "not-a-url",
        clientId: "demo-client",
        clientSecret: "demo-secret"
      })
    ).toThrow("issuer must be an absolute URI without query or fragment");

    expect(() =>
      createAuthPlatformProvider({
        issuer: "https://auth.example.com/api/demo",
        clientId: "",
        clientSecret: "demo-secret"
      })
    ).toThrow("clientId is required");
  });

  test("extracts the stable issuer and subject from a Better Auth account", () => {
    expect(
      readAuthPlatformIdentity(
        [
          {
            providerId: "auth-platform",
            accountId: "central-user-123"
          }
        ],
        {
          issuer: "https://auth.example.com/api/demo/"
        }
      )
    ).toEqual({
      issuer: "https://auth.example.com/api/demo",
      subject: "central-user-123"
    });
  });

  test("does not infer a central identity from email or another provider", () => {
    expect(
      readAuthPlatformIdentity(
        [
          {
            providerId: "github",
            accountId: "github-user",
            email: "user@example.com"
          }
        ],
        {
          issuer: "https://auth.example.com/api/demo"
        }
      )
    ).toBeNull();
  });
});
