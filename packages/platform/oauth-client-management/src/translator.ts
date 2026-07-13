import {
  OAuthClientProfile,
  type ManagedOAuthClient
} from "./model";
import { oauthClientProfile } from "./policy";

export type OAuthClientRow = {
  clientId: string;
  clientSecret?: string | null;
  name?: string | null;
  redirectUris?: string[] | null;
  postLogoutRedirectUris?: string[] | null;
  scopes?: string[] | null;
  grantTypes?: string[] | null;
  responseTypes?: string[] | null;
  tokenEndpointAuthMethod?: string | null;
  type?: string | null;
  disabled?: boolean | null;
  public?: boolean | null;
  skipConsent?: boolean | null;
  requirePKCE?: boolean | null;
  createdAt: Date;
  updatedAt: Date;
};

export type OAuthClientResourceRow = {
  clientId: string;
  resourceId: string;
};

export const managedOAuthClient = (
  row: OAuthClientRow,
  resources: string[]
): ManagedOAuthClient => {
  const profile = oauthClientProfile({
    public: row.public === true,
    grantTypes: row.grantTypes ?? []
  });

  return {
    clientId: row.clientId,
    name: row.name ?? row.clientId,
    profile,
    redirectUris: row.redirectUris ?? [],
    postLogoutRedirectUris: row.postLogoutRedirectUris ?? [],
    scopes: row.scopes ?? [],
    resources: unique(resources),
    disabled: row.disabled === true,
    public: row.public === true,
    skipConsent:
      profile === OAuthClientProfile.Service ? true : row.skipConsent === true,
    requirePkce: row.requirePKCE !== false,
    secretConfigured: Boolean(row.clientSecret),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
};

export const managedOAuthClients = (
  rows: OAuthClientRow[],
  links: OAuthClientResourceRow[]
) => {
  const resources = new Map<string, string[]>();
  for (const link of links) {
    resources.set(link.clientId, [
      ...(resources.get(link.clientId) ?? []),
      link.resourceId
    ]);
  }

  return rows
    .map((row) => managedOAuthClient(row, resources.get(row.clientId) ?? []))
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
};

export const parseOAuthClientRow = (value: unknown): OAuthClientRow => {
  if (!isRecord(value)) {
    throw invalidOAuthModel("OAuth client row");
  }
  const clientId = stringValue(value.clientId);
  const createdAt = dateValue(value.createdAt);
  const updatedAt = dateValue(value.updatedAt);
  if (!clientId || !createdAt || !updatedAt) {
    throw invalidOAuthModel("OAuth client row");
  }

  return {
    clientId,
    clientSecret: optionalString(value.clientSecret),
    name: optionalString(value.name),
    redirectUris: optionalStringArray(value.redirectUris),
    postLogoutRedirectUris: optionalStringArray(value.postLogoutRedirectUris),
    scopes: optionalStringArray(value.scopes),
    grantTypes: optionalStringArray(value.grantTypes),
    responseTypes: optionalStringArray(value.responseTypes),
    tokenEndpointAuthMethod: optionalString(value.tokenEndpointAuthMethod),
    type: optionalString(value.type),
    disabled: optionalBoolean(value.disabled),
    public: optionalBoolean(value.public),
    skipConsent: optionalBoolean(value.skipConsent),
    requirePKCE: optionalBoolean(value.requirePKCE),
    createdAt,
    updatedAt
  };
};

export const parseOAuthClientResourceRow = (
  value: unknown
): OAuthClientResourceRow => {
  if (!isRecord(value)) {
    throw invalidOAuthModel("OAuth resource link");
  }
  const clientId = stringValue(value.clientId);
  const resourceId = stringValue(value.resourceId);
  if (!clientId || !resourceId) {
    throw invalidOAuthModel("OAuth resource link");
  }

  return { clientId, resourceId };
};

const unique = (values: string[]) => [...new Set(values)];

const stringValue = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : null;

const optionalString = (value: unknown) =>
  value === undefined || value === null
    ? undefined
    : stringValue(value) ?? undefined;

const optionalStringArray = (value: unknown) => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw invalidOAuthModel("OAuth string array");
  }

  return [...value];
};

const optionalBoolean = (value: unknown) => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw invalidOAuthModel("OAuth boolean");
  }

  return value;
};

const dateValue = (value: unknown) => {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  return null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const invalidOAuthModel = (model: string) =>
  new Error(`Better Auth returned an invalid ${model}`);
