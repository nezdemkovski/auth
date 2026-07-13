export enum OAuthScope {
  OpenId = "openid",
  Profile = "profile",
  Email = "email",
  OfflineAccess = "offline_access",
  StorageAvatarWrite = "storage:avatar:write",
  StorageAvatarDelete = "storage:avatar:delete",
  BillingUsageRead = "billing:usage:read",
  BillingUsageWrite = "billing:usage:write"
}

export enum OAuthResource {
  Storage = "storage",
  Billing = "billing"
}

export enum OAuthTokenKind {
  User = "user",
  Service = "service"
}

export const OAUTH_SCOPES = Object.values(OAuthScope);

export const OAUTH_DYNAMIC_CLIENT_SCOPES = [
  OAuthScope.OpenId,
  OAuthScope.Profile,
  OAuthScope.Email,
  OAuthScope.OfflineAccess
];

export const oauthResourceScopes = (resource: OAuthResource) => {
  if (resource === OAuthResource.Storage) {
    return [OAuthScope.StorageAvatarWrite, OAuthScope.StorageAvatarDelete];
  }
  if (resource === OAuthResource.Billing) {
    return [OAuthScope.BillingUsageRead, OAuthScope.BillingUsageWrite];
  }

  return [];
};

export const oauthTokenKindClaim = (publicBaseUrl: string) => {
  return `${new URL(publicBaseUrl).origin}/claims/token-kind`;
};

export const oauthResourceIdentifier = (
  publicBaseUrl: string,
  projectSlug: string,
  resource: OAuthResource
) => {
  if (resource === OAuthResource.Storage) {
    return `${publicBaseUrl}/api/${projectSlug}/upload`;
  }
  if (resource === OAuthResource.Billing) {
    return `${publicBaseUrl}/api/${projectSlug}/billing`;
  }

  throw new Error(`Unknown OAuth resource: ${resource}`);
};

export const oauthResourceDefinitions = (
  publicBaseUrl: string,
  projectSlug: string
) => {
  return Object.values(OAuthResource).map((resource) => ({
    identifier: oauthResourceIdentifier(publicBaseUrl, projectSlug, resource),
    allowedScopes: oauthResourceScopes(resource)
  }));
};

export const oauthResourceMetadataUrl = (
  publicBaseUrl: string,
  projectSlug: string,
  resource: OAuthResource
) => {
  const identifier = new URL(
    oauthResourceIdentifier(publicBaseUrl, projectSlug, resource)
  );
  return `${identifier.origin}/.well-known/oauth-protected-resource${identifier.pathname}`;
};
