import {
  AuthConnectionKind,
  ServicePermission,
  type CreateAuthConnectionInput,
  type UpdateAuthConnectionInput
} from "./model";

const MAX_CLIENT_ID_LENGTH = 256;
const MAX_CLIENT_NAME_LENGTH = 120;
const MAX_PERMISSION_COUNT = 20;

export const parseAuthConnectionId = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }
  const clientId = value.trim();
  return clientId && clientId.length <= MAX_CLIENT_ID_LENGTH ? clientId : null;
};

export const parseAuthConnectionCreate = (
  value: unknown
): CreateAuthConnectionInput | null => {
  if (!isRecord(value)) {
    return null;
  }
  const name = parseName(value.name);
  if (!name) {
    return null;
  }

  if (value.kind === AuthConnectionKind.Application) {
    if (!hasOnlyKeys(value, ["kind", "name", "backendUrl"])) {
      return null;
    }
    const backendUrl = parseBackendUrl(value.backendUrl);
    return backendUrl
      ? { kind: AuthConnectionKind.Application, name, backendUrl }
      : null;
  }

  if (value.kind === AuthConnectionKind.Service) {
    if (!hasOnlyKeys(value, ["kind", "name", "permissions"])) {
      return null;
    }
    const permissions = parsePermissions(value.permissions);
    return permissions
      ? { kind: AuthConnectionKind.Service, name, permissions }
      : null;
  }

  return null;
};

export const parseAuthConnectionUpdate = (
  value: unknown
): UpdateAuthConnectionInput | null => {
  if (!isRecord(value) || !hasOnlyKeys(value, ["name"])) {
    return null;
  }
  const name = parseName(value.name);
  return name ? { name } : null;
};

const parseBackendUrl = (value: unknown) => {
  if (typeof value !== "string" || value.length > 2_048) {
    return null;
  }

  try {
    const url = new URL(value.trim());
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
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
};

const parseName = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }
  const name = value.trim();
  return name && name.length <= MAX_CLIENT_NAME_LENGTH ? name : null;
};

const parsePermissions = (value: unknown) => {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_PERMISSION_COUNT
  ) {
    return null;
  }

  const permissions: ServicePermission[] = [];
  for (const item of value) {
    if (item !== ServicePermission.BillingUsageWrite) {
      return null;
    }
    if (!permissions.includes(item)) {
      permissions.push(item);
    }
  }

  return permissions;
};

const hasOnlyKeys = (value: Record<string, unknown>, allowed: string[]) => {
  return Object.keys(value).every((key) => allowed.includes(key));
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
