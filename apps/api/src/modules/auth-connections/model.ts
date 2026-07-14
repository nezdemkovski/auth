import { OAuthClientProfile } from "@nezdemkovski/auth-oauth-client-management";

export enum AuthConnectionKind {
  Application = "application",
  Service = "service",
  Advanced = "advanced"
}

export enum ServicePermission {
  BillingUsageWrite = "billing_usage_write"
}

export type CreateApplicationConnectionInput = {
  kind: AuthConnectionKind.Application;
  name: string;
  appUrl: string;
};

// First-party marker: the managed SPA app client is the only public client
// created with skipConsent; DCR/MCP public clients always go through consent.
export const isApplicationConnectionClient = (client: {
  profile: OAuthClientProfile;
  skipConsent: boolean;
}) => client.profile === OAuthClientProfile.Public && client.skipConsent;

export type CreateServiceConnectionInput = {
  kind: AuthConnectionKind.Service;
  name: string;
  permissions: ServicePermission[];
};

export type CreateAuthConnectionInput =
  | CreateApplicationConnectionInput
  | CreateServiceConnectionInput;

export type UpdateAuthConnectionInput = {
  name: string;
};
