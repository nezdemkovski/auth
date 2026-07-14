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

export const errorMessage = (caught: unknown, fallback: string) =>
  caught instanceof Error ? caught.message : fallback;
