import { describe, expect, test } from "bun:test";

import {
  normalizeAuthConfiguration,
  realmSlugFromIssuer
} from "../shared/config";

describe("auth configuration", () => {
  test("derives every protocol detail from issuer and client id", () => {
    expect(
      normalizeAuthConfiguration({
        issuer: " https://auth.example.com/api/demo/ ",
        clientId: " demo-client "
      })
    ).toEqual({
      issuer: "https://auth.example.com/api/demo",
      clientId: "demo-client",
      applicationResource: "https://auth.example.com/api/demo/app",
      jwksUrl: "https://auth.example.com/api/demo/auth/.well-known/jwks.json",
      tokenKindClaim: "https://auth.example.com/claims/token-kind"
    });
  });

  test("rejects an empty client id", () => {
    expect(() =>
      normalizeAuthConfiguration({
        issuer: "https://auth.example.com/api/demo",
        clientId: " "
      })
    ).toThrow("AUTH_CLIENT_ID is required");
  });

  test("derives the native application scheme from the realm issuer", () => {
    expect(realmSlugFromIssuer("https://auth.example.com/api/demo")).toBe("demo");
  });
});
