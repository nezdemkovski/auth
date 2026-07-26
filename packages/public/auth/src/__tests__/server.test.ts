import { describe, expect, test } from "bun:test";

import {
  AuthVerificationError,
  extractBearerToken,
  identityFromClaims
} from "../server";

const configuration = {
  issuer: "https://auth.example.com/api/demo",
  clientId: "demo-client",
  resource: "https://auth.example.com/api/demo/app",
  jwksUrl: "https://auth.example.com/api/demo/auth/.well-known/jwks.json",
  tokenKindClaim: "https://auth.example.com/claims/token-kind"
};

describe("auth server boundary", () => {
  test("accepts only a strict bearer authorization header", () => {
    expect(extractBearerToken("Bearer access-token")).toBe("access-token");
    expect(extractBearerToken("bearer access-token")).toBe("access-token");
    expect(extractBearerToken("Bearer access-token extra")).toBeNull();
    expect(extractBearerToken("Basic access-token")).toBeNull();
  });

  test("builds a user identity only for this application client", () => {
    expect(
      identityFromClaims(
        {
          sub: "user-1",
          client_id: "demo-client",
          scope: "openid profile",
          telegram_id: "123456789",
          "https://auth.example.com/claims/token-kind": "user"
        },
        configuration
      )
    ).toEqual({
      issuer: "https://auth.example.com/api/demo",
      subject: "user-1",
      clientId: "demo-client",
      scopes: ["openid", "profile"],
      telegramId: "123456789"
    });
  });

  test("rejects service tokens and tokens issued for another application", () => {
    expect(() =>
      identityFromClaims(
        {
          sub: "service-1",
          client_id: "demo-client",
          "https://auth.example.com/claims/token-kind": "service"
        },
        configuration
      )
    ).toThrow(AuthVerificationError);
    expect(() =>
      identityFromClaims(
        {
          sub: "user-1",
          client_id: "other-client",
          "https://auth.example.com/claims/token-kind": "user"
        },
        configuration
      )
    ).toThrow("another client");
  });

  test("accepts any OAuth client only for an explicit resource server", () => {
    const identity = identityFromClaims(
      {
        sub: "user-1",
        client_id: "dynamic-mcp-client",
        scope: "openid profile",
        "https://auth.example.com/claims/token-kind": "user"
      },
      {
        issuer: configuration.issuer,
        resource: "https://openmarkers.example/mcp",
        jwksUrl: configuration.jwksUrl,
        tokenKindClaim: configuration.tokenKindClaim
      }
    );

    expect(identity.clientId).toBe("dynamic-mcp-client");
    expect(identity.subject).toBe("user-1");
  });
});
