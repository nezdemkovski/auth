import { runWithTransaction } from "@better-auth/core/context";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import type {
  OAuthOptions,
  SchemaClient,
  Scope
} from "@better-auth/oauth-provider";

import {
  parseOAuthClientResourceRow,
  parseOAuthClientRow,
  type OAuthClientResourceRow,
  type OAuthClientRow
} from "./translator";

export type OAuthAdapter = DBAdapter;

export const listOAuthClientRows = async (
  adapter: OAuthAdapter,
  options: OAuthOptions<Scope[]>
): Promise<OAuthClientRow[]> => {
  const rows: unknown[] = await adapter.findMany({
    model: clientModel(options)
  });
  return rows.map(parseOAuthClientRow);
};

export const findOAuthClientRow = async (
  adapter: OAuthAdapter,
  options: OAuthOptions<Scope[]>,
  clientId: string
): Promise<OAuthClientRow | null> => {
  const value: unknown = await adapter.findOne({
    model: clientModel(options),
    where: [{ field: "clientId", value: clientId }]
  });
  if (value === null) {
    return null;
  }

  return parseOAuthClientRow(value);
};

export const listOAuthClientResourceRows = async (
  adapter: OAuthAdapter,
  options: OAuthOptions<Scope[]>,
  clientId?: string
): Promise<OAuthClientResourceRow[]> => {
  const rows: unknown[] = await adapter.findMany({
    model: clientResourceModel(options),
    ...(clientId
      ? { where: [{ field: "clientId", value: clientId }] }
      : {})
  });
  return rows.map(parseOAuthClientResourceRow);
};

export const findMissingOAuthResource = async (
  adapter: OAuthAdapter,
  options: OAuthOptions<Scope[]>,
  resources: string[]
) => {
  for (const resourceId of resources) {
    const resource: unknown = await adapter.findOne({
      model: resourceModel(options),
      where: [{ field: "identifier", value: resourceId }]
    });
    if (resource === null) {
      return resourceId;
    }
  }

  return null;
};

export const createOAuthClientRecord = async (
  adapter: OAuthAdapter,
  options: OAuthOptions<Scope[]>,
  input: {
    clientId: string;
    client: SchemaClient<Scope[]>;
    resources: string[];
    now: Date;
  }
) => {
  await runWithTransaction(adapter, async () => {
    await adapter.create({
      model: clientModel(options),
      data: {
        ...input.client,
        createdAt: input.now,
        updatedAt: input.now
      }
    });
    await createResourceLinks(
      adapter,
      options,
      input.clientId,
      input.resources,
      input.now
    );
  });
};

export const updateOAuthClientRecord = async (
  adapter: OAuthAdapter,
  options: OAuthOptions<Scope[]>,
  input: {
    clientId: string;
    update: Record<string, unknown>;
    resources?: string[];
    now: Date;
  }
) => {
  return runWithTransaction(adapter, async () => {
    const updated = await adapter.update({
      model: clientModel(options),
      where: [{ field: "clientId", value: input.clientId }],
      update: {
        ...input.update,
        updatedAt: input.now
      }
    });
    if (!updated) {
      return false;
    }
    if (input.resources) {
      await replaceResourceLinks(
        adapter,
        options,
        input.clientId,
        input.resources,
        input.now
      );
    }

    return true;
  });
};

export const deleteOAuthClientRecord = async (
  adapter: OAuthAdapter,
  options: OAuthOptions<Scope[]>,
  clientId: string
) => {
  await adapter.delete({
    model: clientModel(options),
    where: [{ field: "clientId", value: clientId }]
  });
};

const replaceResourceLinks = async (
  adapter: OAuthAdapter,
  options: OAuthOptions<Scope[]>,
  clientId: string,
  resources: string[],
  now: Date
) => {
  await adapter.deleteMany({
    model: clientResourceModel(options),
    where: [{ field: "clientId", value: clientId }]
  });
  await createResourceLinks(adapter, options, clientId, resources, now);
};

const createResourceLinks = async (
  adapter: OAuthAdapter,
  options: OAuthOptions<Scope[]>,
  clientId: string,
  resources: string[],
  createdAt: Date
) => {
  for (const resourceId of resources) {
    await adapter.create({
      model: clientResourceModel(options),
      forceAllowId: true,
      data: {
        id: `${clientId}::${resourceId}`,
        clientId,
        resourceId,
        createdAt
      }
    });
  }
};

const clientModel = (options: OAuthOptions<Scope[]>) =>
  options.schema?.oauthClient?.modelName ?? "oauthClient";

const resourceModel = (options: OAuthOptions<Scope[]>) =>
  options.schema?.oauthResource?.modelName ?? "oauthResource";

const clientResourceModel = (options: OAuthOptions<Scope[]>) =>
  options.schema?.oauthClientResource?.modelName ?? "oauthClientResource";
