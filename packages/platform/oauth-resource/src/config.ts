import {
  OAuthResource,
  OAuthScope
} from "./model";

export const OAUTH_SCOPES = Object.values(OAuthScope);

export const OAUTH_DYNAMIC_CLIENT_SCOPES = [
  OAuthScope.OpenId,
  OAuthScope.Profile,
  OAuthScope.Email,
  OAuthScope.OfflineAccess
];

export const oauthResourceScopes = (resource: OAuthResource) => {
  if (resource === OAuthResource.Application) {
    return [
      OAuthScope.OpenId,
      OAuthScope.Profile,
      OAuthScope.Email,
      OAuthScope.OfflineAccess,
      OAuthScope.StorageAvatarWrite,
      OAuthScope.StorageAvatarDelete,
      OAuthScope.BillingUsageRead,
      OAuthScope.BillingCheckoutCreate,
      OAuthScope.BillingPortalRead
    ];
  }
  if (resource === OAuthResource.Storage) {
    return [OAuthScope.StorageAvatarWrite, OAuthScope.StorageAvatarDelete];
  }
  if (resource === OAuthResource.Billing) {
    return [
      OAuthScope.BillingUsageRead,
      OAuthScope.BillingUsageWrite,
      OAuthScope.BillingCheckoutCreate,
      OAuthScope.BillingPortalRead
    ];
  }

  return [];
};

export const oauthResourceMetadataScopes = (resource: OAuthResource) => {
  return oauthResourceScopes(resource).filter(
    (scope) => !OAUTH_DYNAMIC_CLIENT_SCOPES.includes(scope)
  );
};

export const oauthTokenKindClaim = (publicBaseUrl: string) => {
  return `${new URL(publicBaseUrl).origin}/claims/token-kind`;
};

export const oauthResourceIdentifier = (
  publicBaseUrl: string,
  projectSlug: string,
  resource: OAuthResource
) => {
  if (resource === OAuthResource.Application) {
    return `${publicBaseUrl}/api/${projectSlug}/app`;
  }
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
