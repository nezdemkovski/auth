import { describe, expect, test } from "bun:test";
import { OAuthClientProfile } from "@nezdemkovski/auth-oauth-client-management";

import {
  parseOAuthClientCreate,
  parseOAuthClientUpdate
} from "../validator";

describe("OAuth client management input", () => {
  test("normalizes a service client request without inventing browser fields", () => {
    expect(
      parseOAuthClientCreate({
        name: "  Demo Worker  ",
        profile: OAuthClientProfile.Service,
        scopes: ["billing:usage:write", "billing:usage:write"],
        resources: ["https://auth.example.com/api/demo/billing"]
      })
    ).toEqual({
      name: "Demo Worker",
      profile: OAuthClientProfile.Service,
      redirectUris: [],
      postLogoutRedirectUris: [],
      scopes: ["billing:usage:write"],
      resources: ["https://auth.example.com/api/demo/billing"]
    });
  });

  test("rejects unknown profiles, malformed URLs, and space-delimited scope input", () => {
    expect(
      parseOAuthClientCreate({
        name: "Demo App",
        profile: "machine-user",
        redirectUris: ["not-a-url"],
        scopes: ["openid profile"]
      })
    ).toBeNull();
  });

  test("accepts only non-empty lifecycle patches", () => {
    expect(parseOAuthClientUpdate({})).toBeNull();
    expect(
      parseOAuthClientUpdate({
        name: "  Updated Demo App ",
        resources: []
      })
    ).toEqual({
      name: "Updated Demo App",
      resources: []
    });
  });
});
