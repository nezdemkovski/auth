import { describe, expect, test } from "bun:test";

import { OAuthClientProfile } from "../../../../types";
import { buildOAuthClientEnvironment } from "../environment";

describe("OAuth client environment", () => {
  test("uses the product integration variable names for a web client", () => {
    expect(
      buildOAuthClientEnvironment({
        issuer: "https://auth.example.com/api/demo",
        profile: OAuthClientProfile.Web,
        credential: {
          clientId: "demo-client",
          clientSecret: "demo-secret"
        }
      })
    ).toBe(
      [
        "AUTH_ISSUER=https://auth.example.com/api/demo",
        "AUTH_CLIENT_ID=demo-client",
        "AUTH_CLIENT_SECRET=demo-secret"
      ].join("\n")
    );
  });

  test("keeps service credentials separate from the product login client", () => {
    expect(
      buildOAuthClientEnvironment({
        issuer: "https://auth.example.com/api/demo",
        profile: OAuthClientProfile.Service,
        credential: {
          clientId: "demo-service",
          clientSecret: "demo-service-secret"
        }
      })
    ).toContain("AUTH_SERVICE_CLIENT_ID=demo-service");
  });

  test("does not invent a secret for a public client", () => {
    expect(
      buildOAuthClientEnvironment({
        issuer: "https://auth.example.com/api/demo",
        profile: OAuthClientProfile.Public,
        credential: { clientId: "demo-public" }
      })
    ).not.toContain("SECRET");
  });
});
