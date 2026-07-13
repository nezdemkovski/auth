import { OAuthClientProfile } from "../../../types";

export type ConfirmedAction = {
  clientId: string;
  action: "rotate" | "delete";
};

export type PendingAction = {
  clientId: string;
  action: "create" | "toggle" | "rotate" | "delete";
};

export const PROFILE_OPTIONS = [
  { value: OAuthClientProfile.Web, label: "Web / product backend" },
  { value: OAuthClientProfile.Public, label: "Public / native client" },
  { value: OAuthClientProfile.Service, label: "Service / machine-to-machine" }
];

export const DEFAULT_LOGIN_SCOPES = "openid\nprofile\nemail\noffline_access";
export const DEFAULT_SERVICE_SCOPES = "billing:usage:write";

export const splitLines = (value: string) =>
  Array.from(
    new Set(
      value
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );

export const parseProfile = (value: string) => {
  if (value === OAuthClientProfile.Public) {
    return OAuthClientProfile.Public;
  }
  if (value === OAuthClientProfile.Service) {
    return OAuthClientProfile.Service;
  }
  return OAuthClientProfile.Web;
};

export const profileLabel = (profile: OAuthClientProfile) => {
  if (profile === OAuthClientProfile.Public) {
    return "Public";
  }
  if (profile === OAuthClientProfile.Service) {
    return "Service";
  }
  return "Web";
};

export const errorMessage = (caught: unknown, fallback: string) =>
  caught instanceof Error ? caught.message : fallback;
