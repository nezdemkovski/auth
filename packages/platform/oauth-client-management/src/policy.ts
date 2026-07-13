import type { OAuthClient } from "@better-auth/oauth-provider";

import {
  OAuthClientProfile,
  type CreateManagedOAuthClientInput
} from "./model";

export type OAuthClientRegistration = Pick<
  OAuthClient,
  | "client_name"
  | "redirect_uris"
  | "post_logout_redirect_uris"
  | "token_endpoint_auth_method"
  | "grant_types"
  | "response_types"
  | "scope"
  | "type"
  | "skip_consent"
  | "require_pkce"
>;

export const oauthClientRegistration = (
  input: CreateManagedOAuthClientInput
): OAuthClientRegistration => {
  if (input.profile === OAuthClientProfile.Service) {
    return {
      client_name: input.name,
      redirect_uris: [],
      post_logout_redirect_uris: [],
      token_endpoint_auth_method: "client_secret_basic",
      grant_types: ["client_credentials"],
      response_types: [],
      scope: input.scopes.join(" "),
      skip_consent: true,
      require_pkce: false
    };
  }

  if (input.profile === OAuthClientProfile.Public) {
    return {
      client_name: input.name,
      redirect_uris: input.redirectUris,
      post_logout_redirect_uris: input.postLogoutRedirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: input.scopes.join(" "),
      type: "native",
      skip_consent: input.skipConsent ?? false,
      require_pkce: true
    };
  }

  return {
    client_name: input.name,
    redirect_uris: input.redirectUris,
    post_logout_redirect_uris: input.postLogoutRedirectUris,
    token_endpoint_auth_method: "client_secret_basic",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: input.scopes.join(" "),
    type: "web",
    skip_consent: input.skipConsent ?? true,
    require_pkce: true
  };
};

export const oauthClientProfile = (input: {
  public: boolean;
  grantTypes: string[];
}) => {
  if (input.grantTypes.includes("client_credentials")) {
    return OAuthClientProfile.Service;
  }
  if (input.public) {
    return OAuthClientProfile.Public;
  }

  return OAuthClientProfile.Web;
};
