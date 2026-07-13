import { describe, expect, test } from "bun:test";

import {
  OAuthClientProfile,
  oauthClientProfile,
  oauthClientRegistration
} from "../index";

describe("OAuth client profiles", () => {
  test("turns a service profile into a headless client-credentials registration", () => {
    expect(
      oauthClientRegistration({
        name: "Demo Worker",
        profile: OAuthClientProfile.Service,
        redirectUris: [],
        postLogoutRedirectUris: [],
        scopes: ["billing:usage:write"],
        resources: ["https://auth.example.com/api/demo/billing"]
      })
    ).toMatchObject({
      client_name: "Demo Worker",
      redirect_uris: [],
      token_endpoint_auth_method: "client_secret_basic",
      grant_types: ["client_credentials"],
      response_types: [],
      scope: "billing:usage:write",
      skip_consent: true,
      require_pkce: false
    });
  });

  test("keeps public clients secretless and PKCE-bound", () => {
    const registration = oauthClientRegistration({
      name: "Demo CLI",
      profile: OAuthClientProfile.Public,
      redirectUris: ["http://127.0.0.1:4321/callback"],
      postLogoutRedirectUris: [],
      scopes: ["openid", "profile"],
      resources: []
    });

    expect(registration).toMatchObject({
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      type: "native",
      skip_consent: false,
      require_pkce: true
    });
    expect(
      oauthClientProfile({ public: true, grantTypes: ["authorization_code"] })
    ).toBe(OAuthClientProfile.Public);
  });
});
