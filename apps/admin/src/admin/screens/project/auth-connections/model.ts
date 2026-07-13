import {
  AuthConnectionKind,
  type ServicePermission,
  type ServicePermissionCatalogItem
} from "../../../types";

export type ConfirmedAction = {
  clientId: string;
  action: "rotate" | "delete";
};

export type PendingAction = {
  clientId: string;
  action: "create" | "toggle" | "rotate" | "delete";
};

export const connectionKindLabel = (kind: AuthConnectionKind) => {
  if (kind === AuthConnectionKind.Application) {
    return "User sign-in";
  }
  if (kind === AuthConnectionKind.Service) {
    return "Server access";
  }
  return "Advanced";
};

export const permissionLabel = (
  permission: ServicePermission,
  catalog: ServicePermissionCatalogItem[]
) => catalog.find((item) => item.id === permission)?.name ?? permission;

export const applicationCallbackUrl = (backendUrl: string) => {
  try {
    const url = new URL(backendUrl.trim());
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    url.pathname = url.pathname.replace(/\/+$/, "");
    const normalized = url.toString().replace(/\/$/, "");
    return `${normalized}/api/auth/oauth2/callback/auth-platform`;
  } catch {
    return null;
  }
};

export const errorMessage = (caught: unknown, fallback: string) =>
  caught instanceof Error ? caught.message : fallback;
