import {
  OAuthClientProfile,
  type CreateManagedOAuthClientInput,
  type UpdateManagedOAuthClientInput
} from "@nezdemkovski/auth-oauth-client-management";

const MAX_CLIENT_ID_LENGTH = 256;
const MAX_CLIENT_NAME_LENGTH = 120;
const MAX_COLLECTION_LENGTH = 20;
const MAX_SCOPE_COUNT = 50;
const MAX_VALUE_LENGTH = 256;

export const parseOAuthClientId = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }
  const clientId = value.trim();
  return clientId && clientId.length <= MAX_CLIENT_ID_LENGTH ? clientId : null;
};

export const parseOAuthClientCreate = (
  value: unknown
): CreateManagedOAuthClientInput | null => {
  if (!isRecord(value)) {
    return null;
  }
  const name = parseName(value.name);
  const profile = parseProfile(value.profile);
  const redirectUris = parseUriArray(value.redirectUris, []);
  const postLogoutRedirectUris = parseUriArray(value.postLogoutRedirectUris, []);
  const scopes = parseScopes(value.scopes);
  const resources = parseUriArray(value.resources, []);
  const skipConsent = optionalBoolean(value.skipConsent);
  if (
    !name ||
    !profile ||
    !redirectUris ||
    !postLogoutRedirectUris ||
    !scopes ||
    !resources ||
    skipConsent === null
  ) {
    return null;
  }

  return {
    name,
    profile,
    redirectUris,
    postLogoutRedirectUris,
    scopes,
    resources,
    ...(skipConsent === undefined ? {} : { skipConsent })
  };
};

export const parseOAuthClientUpdate = (
  value: unknown
): UpdateManagedOAuthClientInput | null => {
  if (!isRecord(value)) {
    return null;
  }
  const update: UpdateManagedOAuthClientInput = {};
  if (value.name !== undefined) {
    const name = parseName(value.name);
    if (!name) {
      return null;
    }
    update.name = name;
  }
  if (value.redirectUris !== undefined) {
    const redirectUris = parseUriArray(value.redirectUris);
    if (!redirectUris) {
      return null;
    }
    update.redirectUris = redirectUris;
  }
  if (value.postLogoutRedirectUris !== undefined) {
    const postLogoutRedirectUris = parseUriArray(value.postLogoutRedirectUris);
    if (!postLogoutRedirectUris) {
      return null;
    }
    update.postLogoutRedirectUris = postLogoutRedirectUris;
  }
  if (value.scopes !== undefined) {
    const scopes = parseScopes(value.scopes);
    if (!scopes) {
      return null;
    }
    update.scopes = scopes;
  }
  if (value.resources !== undefined) {
    const resources = parseUriArray(value.resources);
    if (!resources) {
      return null;
    }
    update.resources = resources;
  }
  if (value.skipConsent !== undefined) {
    if (typeof value.skipConsent !== "boolean") {
      return null;
    }
    update.skipConsent = value.skipConsent;
  }

  return Object.keys(update).length > 0 ? update : null;
};

const parseProfile = (value: unknown) => {
  if (value === OAuthClientProfile.Web) {
    return OAuthClientProfile.Web;
  }
  if (value === OAuthClientProfile.Public) {
    return OAuthClientProfile.Public;
  }
  if (value === OAuthClientProfile.Service) {
    return OAuthClientProfile.Service;
  }

  return null;
};

const parseName = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }
  const name = value.trim();
  return name && name.length <= MAX_CLIENT_NAME_LENGTH ? name : null;
};

const parseScopes = (value: unknown) => {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SCOPE_COUNT) {
    return null;
  }
  const scopes: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      return null;
    }
    const scope = item.trim();
    if (!scope || scope.length > MAX_VALUE_LENGTH || /\s/.test(scope)) {
      return null;
    }
    scopes.push(scope);
  }

  return unique(scopes);
};

const parseUriArray = (value: unknown, fallback?: string[]) => {
  if (value === undefined && fallback) {
    return fallback;
  }
  if (!Array.isArray(value) || value.length > MAX_COLLECTION_LENGTH) {
    return null;
  }
  const uris: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.length > 2_048) {
      return null;
    }
    const uri = item.trim();
    try {
      const parsed = new URL(uri);
      if (!parsed.protocol) {
        return null;
      }
    } catch {
      return null;
    }
    uris.push(uri);
  }

  return unique(uris);
};

const optionalBoolean = (value: unknown) => {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "boolean" ? value : null;
};

const unique = (values: string[]) => [...new Set(values)];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
