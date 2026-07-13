import { normalizeIdentifier } from "../shared/identifier";

export enum AuthPlatformResource {
  Storage = "upload",
  Billing = "billing"
}

export enum AuthPlatformResourceScope {
  StorageAvatarWrite = "storage:avatar:write",
  StorageAvatarDelete = "storage:avatar:delete",
  BillingUsageRead = "billing:usage:read",
  BillingUsageWrite = "billing:usage:write"
}

export const authPlatformResourceIdentifier = (
  issuer: string,
  resource: AuthPlatformResource
) => {
  return `${normalizeIdentifier(issuer, "issuer")}/${resource}`;
};

export const authPlatformResourceMetadataUrl = (
  issuer: string,
  resource: AuthPlatformResource
) => {
  const identifier = new URL(
    authPlatformResourceIdentifier(issuer, resource)
  );
  return `${identifier.origin}/.well-known/oauth-protected-resource${identifier.pathname}`;
};

export const authPlatformResourceScopes = (
  resource: AuthPlatformResource
) => {
  if (resource === AuthPlatformResource.Storage) {
    return [
      AuthPlatformResourceScope.StorageAvatarWrite,
      AuthPlatformResourceScope.StorageAvatarDelete
    ];
  }

  return [
    AuthPlatformResourceScope.BillingUsageRead,
    AuthPlatformResourceScope.BillingUsageWrite
  ];
};
