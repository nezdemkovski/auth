import type { ResourceServerMetadata } from "@better-auth/oauth-provider";
import type { ResourceRequestInput } from "better-auth/oauth2";

export enum OAuthScope {
  OpenId = "openid",
  Profile = "profile",
  Email = "email",
  OfflineAccess = "offline_access",
  StorageAvatarWrite = "storage:avatar:write",
  StorageAvatarDelete = "storage:avatar:delete",
  BillingUsageRead = "billing:usage:read",
  BillingUsageWrite = "billing:usage:write",
  BillingCheckoutCreate = "billing:checkout:create",
  BillingPortalRead = "billing:portal:read"
}

export enum OAuthResource {
  Application = "app",
  Storage = "storage",
  Billing = "billing"
}

export enum OAuthTokenKind {
  User = "user",
  Service = "service"
}

export enum OAuthResourceErrorKind {
  UnknownProject = "unknown_project",
  InvalidToken = "invalid_token",
  InsufficientScope = "insufficient_scope"
}

export enum OAuthResourceFailureCode {
  UnknownProject = "unknown_project",
  Unauthorized = "unauthorized",
  InsufficientScope = "insufficient_scope"
}

export class OAuthResourceError extends Error {
  constructor(readonly kind: OAuthResourceErrorKind) {
    super(kind);
    this.name = "OAuthResourceError";
  }
}

export type OAuthResourceAuth = {
  getProtectedResourceMetadata(
    metadata: ResourceServerMetadata
  ): Promise<ResourceServerMetadata>;
  verifyAccessTokenRequest(
    request: ResourceRequestInput,
    options: {
      jwksUrl: string;
      issuer: string;
      audience: string;
      scopes: string[];
    }
  ): Promise<Record<string, unknown>>;
};

export type OAuthResourceRegistration<TRegistered> = {
  registered: TRegistered;
  projectSlug: string;
  oauthProviderEnabled: boolean;
  auth: OAuthResourceAuth;
};

export type OAuthResourceRegistry<TRegistered> = {
  get(
    projectSlug: string
  ): OAuthResourceRegistration<TRegistered> | null | undefined;
};

export type UserOAuthResourceAccess<TRegistered> = {
  registered: TRegistered;
  subject: string;
  clientId: string;
};

export type ServiceOAuthResourceAccess<TRegistered> = {
  registered: TRegistered;
  clientId: string;
};

export type OAuthResourceFailureResponse = {
  error: OAuthResourceFailureCode;
  status: 401 | 403 | 404;
  wwwAuthenticate?: string;
};
