import {
  OAuthClientProfile,
  type ManagedOAuthClient,
  type ManagedOAuthClientCredential
} from "@nezdemkovski/auth-oauth-client-management";
import { OAuthScope } from "@nezdemkovski/auth-oauth-resource";

import { AuthConnectionKind, ServicePermission } from "./model";

export const authConnectionResponse = (client: ManagedOAuthClient) => {
  const kind = authConnectionKind(client.profile);

  return {
    clientId: client.clientId,
    name: client.name,
    kind,
    callbackUrl:
      kind === AuthConnectionKind.Application
        ? (client.redirectUris[0] ?? null)
        : null,
    permissions: servicePermissions(client),
    disabled: client.disabled,
    canRotateCredential: !client.public && client.secretConfigured,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString()
  };
};

export const authConnectionCredentialResponse = (
  credential: ManagedOAuthClientCredential
) => ({
  clientId: credential.clientId,
  ...(credential.clientSecret
    ? { clientSecret: credential.clientSecret }
    : {})
});

export const authConnectionCatalogResponse = () => ({
  servicePermissions: [
    {
      id: ServicePermission.BillingUsageWrite,
      name: "Record billing usage",
      description:
        "Allow a trusted backend to consume and manage user quotas in this realm."
    }
  ]
});

const authConnectionKind = (profile: OAuthClientProfile) => {
  if (profile === OAuthClientProfile.Web) {
    return AuthConnectionKind.Application;
  }
  if (profile === OAuthClientProfile.Service) {
    return AuthConnectionKind.Service;
  }
  return AuthConnectionKind.Advanced;
};

const servicePermissions = (client: ManagedOAuthClient) => {
  if (
    client.profile === OAuthClientProfile.Service &&
    client.scopes.includes(OAuthScope.BillingUsageWrite)
  ) {
    return [ServicePermission.BillingUsageWrite];
  }
  return [];
};
