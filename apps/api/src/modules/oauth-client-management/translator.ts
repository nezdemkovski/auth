import type {
  ManagedOAuthClient,
  ManagedOAuthClientCredential
} from "@nezdemkovski/auth-oauth-client-management";

export const oauthClientResponse = (client: ManagedOAuthClient) => ({
  clientId: client.clientId,
  name: client.name,
  profile: client.profile,
  redirectUris: client.redirectUris,
  postLogoutRedirectUris: client.postLogoutRedirectUris,
  scopes: client.scopes,
  resources: client.resources,
  disabled: client.disabled,
  public: client.public,
  skipConsent: client.skipConsent,
  requirePkce: client.requirePkce,
  secretConfigured: client.secretConfigured,
  createdAt: client.createdAt.toISOString(),
  updatedAt: client.updatedAt.toISOString()
});

export const oauthClientCredentialResponse = (
  credential: ManagedOAuthClientCredential
) => ({
  clientId: credential.clientId,
  ...(credential.clientSecret
    ? { clientSecret: credential.clientSecret }
    : {})
});
