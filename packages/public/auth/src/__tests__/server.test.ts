import { describe, expect, test } from "bun:test";

import { normalizeAuthConfiguration } from "../shared/config";
import {
  AuthVerificationError,
  extractBearerToken,
  identityFromClaims
} from "../server";

const configuration = normalizeAuthConfiguration({
  issuer: "https://auth.example.com/api/demo",
  clientId: "demo-client"
});

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
});
