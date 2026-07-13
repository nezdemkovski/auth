import {
  checkOAuthClient,
  oauthToSchema,
  type OAuthClient,
  type OAuthOptions,
  type Scope
} from "@better-auth/oauth-provider";
import { randomBase64Url } from "@nezdemkovski/auth-platform-crypto";
import { APIError } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { z } from "zod";

import {
  OAuthClientProfile,
  type CreateManagedOAuthClientInput,
  type ManagedOAuthClient,
  type UpdateManagedOAuthClientInput
} from "./model";
import { oauthClientProfile, oauthClientRegistration } from "./policy";
import { oauthClientSecretStorage } from "./secret";
import {
  createOAuthClientRecord,
  deleteOAuthClientRecord,
  findMissingOAuthResource,
  findOAuthClientRow,
  listOAuthClientResourceRows,
  listOAuthClientRows,
  updateOAuthClientRecord,
  type OAuthAdapter
} from "./store";
import {
  managedOAuthClient,
  managedOAuthClients,
  type OAuthClientRow
} from "./translator";
import {
  createOAuthClientBodySchema,
  oauthClientBodySchema,
  oauthClientQuerySchema,
  updateOAuthClientSchema
} from "./validator";

const createPlugin = (options: OAuthOptions<Scope[]>) => ({
  id: "oauth-client-management",
  endpoints: {
    listOAuthClientsForManagement: createAuthEndpoint(
      "/internal/oauth-client-management/clients",
      {
        method: "GET",
        metadata: { SERVER_ONLY: true }
      },
      async (ctx) => {
        const rows = await listOAuthClientRows(ctx.context.adapter, options);
        const links = await listOAuthClientResourceRows(
          ctx.context.adapter,
          options
        );
        return managedOAuthClients(rows, links);
      }
    ),
    getOAuthClientForManagement: createAuthEndpoint(
      "/internal/oauth-client-management/client",
      {
        method: "GET",
        query: oauthClientQuerySchema,
        metadata: { SERVER_ONLY: true }
      },
      async (ctx) =>
        readManagedOAuthClient(
          ctx.context.adapter,
          options,
          ctx.query.clientId
        )
    ),
    createOAuthClientForManagement: createAuthEndpoint(
      "/internal/oauth-client-management/create-client",
      {
        method: "POST",
        body: createOAuthClientBodySchema,
        metadata: {
          SERVER_ONLY: true,
          noStore: true
        }
      },
      async (ctx) => {
        const input = normalizeCreateInput(ctx.body);
        assertProfileInput(input);
        const registration = oauthClientRegistration(input);
        const clientId = options.generateClientId?.() ?? randomBase64Url(24);
        await checkOAuthClient({ ...registration, client_id: clientId }, options, {
          ctx
        });
        await assertResourcesExist(
          ctx.context.adapter,
          options,
          input.resources
        );

        const rawSecret =
          registration.token_endpoint_auth_method === "none"
            ? undefined
            : options.generateClientSecret?.() ?? randomBase64Url(32);
        const storedSecret = rawSecret
          ? await storeClientSecret(options, rawSecret)
          : undefined;
        const now = currentTimestamp();
        const client = oauthToSchema({
          ...registration,
          client_id: clientId,
          client_secret: storedSecret,
          client_id_issued_at: Math.floor(now.getTime() / 1_000),
          public: registration.token_endpoint_auth_method === "none",
          disabled: false
        });

        await createOAuthClientRecord(ctx.context.adapter, options, {
          clientId,
          client,
          resources: input.resources,
          now
        });

        return {
          client: await readManagedOAuthClient(
            ctx.context.adapter,
            options,
            clientId
          ),
          credential: {
            clientId,
            ...(rawSecret
              ? {
                  clientSecret: `${options.prefix?.clientSecret ?? ""}${rawSecret}`
                }
              : {})
          }
        };
      }
    ),
    updateOAuthClientForManagement: createAuthEndpoint(
      "/internal/oauth-client-management/update-client",
      {
        method: "POST",
        body: z.object({
          clientId: oauthClientBodySchema.shape.clientId,
          update: updateOAuthClientSchema
        }),
        metadata: { SERVER_ONLY: true }
      },
      async (ctx) => {
        const row = await requireOAuthClientRow(
          ctx.context.adapter,
          options,
          ctx.body.clientId
        );
        const update = normalizeUpdateInput(ctx.body.update);
        const registration = updatedRegistration(row, update);
        assertProfileInput({
          name: registration.client_name ?? row.name ?? row.clientId,
          profile: oauthClientProfile({
            public: row.public === true,
            grantTypes: row.grantTypes ?? []
          }),
          redirectUris: registration.redirect_uris,
          postLogoutRedirectUris: registration.post_logout_redirect_uris ?? [],
          scopes: registration.scope?.split(" ").filter(Boolean) ?? [],
          resources: update.resources ?? [],
          skipConsent: registration.skip_consent
        });
        await checkOAuthClient(registration, options, { ctx });
        if (update.resources) {
          await assertResourcesExist(
            ctx.context.adapter,
            options,
            update.resources
          );
        }

        const updated = await updateOAuthClientRecord(
          ctx.context.adapter,
          options,
          {
            clientId: ctx.body.clientId,
            update: updateFields(update, registration),
            ...(update.resources ? { resources: update.resources } : {}),
            now: currentTimestamp()
          }
        );
        if (!updated) {
          throw internalError("OAuth client update failed");
        }

        return readManagedOAuthClient(
          ctx.context.adapter,
          options,
          ctx.body.clientId
        );
      }
    ),
    setOAuthClientDisabledForManagement: createAuthEndpoint(
      "/internal/oauth-client-management/set-client-disabled",
      {
        method: "POST",
        body: z.object({
          clientId: oauthClientBodySchema.shape.clientId,
          disabled: z.boolean()
        }),
        metadata: { SERVER_ONLY: true }
      },
      async (ctx) => {
        await requireOAuthClientRow(
          ctx.context.adapter,
          options,
          ctx.body.clientId
        );
        const updated = await updateOAuthClientRecord(
          ctx.context.adapter,
          options,
          {
            clientId: ctx.body.clientId,
            update: { disabled: ctx.body.disabled },
            now: currentTimestamp()
          }
        );
        if (!updated) {
          throw internalError("OAuth client status update failed");
        }

        return readManagedOAuthClient(
          ctx.context.adapter,
          options,
          ctx.body.clientId
        );
      }
    ),
    rotateOAuthClientSecretForManagement: createAuthEndpoint(
      "/internal/oauth-client-management/rotate-client-secret",
      {
        method: "POST",
        body: oauthClientBodySchema,
        metadata: {
          SERVER_ONLY: true,
          noStore: true
        }
      },
      async (ctx) => {
        const row = await requireOAuthClientRow(
          ctx.context.adapter,
          options,
          ctx.body.clientId
        );
        if (row.public || !row.clientSecret) {
          throw badRequest(
            "Secret rotation is only available for confidential OAuth clients"
          );
        }
        const rawSecret =
          options.generateClientSecret?.() ?? randomBase64Url(32);
        const updated = await updateOAuthClientRecord(
          ctx.context.adapter,
          options,
          {
            clientId: ctx.body.clientId,
            update: {
              clientSecret: await storeClientSecret(options, rawSecret)
            },
            now: currentTimestamp()
          }
        );
        if (!updated) {
          throw internalError("OAuth client secret rotation failed");
        }

        return {
          clientId: ctx.body.clientId,
          clientSecret: `${options.prefix?.clientSecret ?? ""}${rawSecret}`
        };
      }
    ),
    deleteOAuthClientForManagement: createAuthEndpoint(
      "/internal/oauth-client-management/delete-client",
      {
        method: "POST",
        body: oauthClientBodySchema,
        metadata: { SERVER_ONLY: true }
      },
      async (ctx) => {
        await requireOAuthClientRow(
          ctx.context.adapter,
          options,
          ctx.body.clientId
        );
        await deleteOAuthClientRecord(
          ctx.context.adapter,
          options,
          ctx.body.clientId
        );
        return { deleted: true };
      }
    )
  }
});

export const oauthClientManagement = createPlugin;

const readManagedOAuthClient = async (
  adapter: OAuthAdapter,
  options: OAuthOptions<Scope[]>,
  clientId: string
): Promise<ManagedOAuthClient> => {
  const row = await requireOAuthClientRow(adapter, options, clientId);
  const links = await listOAuthClientResourceRows(adapter, options, clientId);
  return managedOAuthClient(
    row,
    links.map((link) => link.resourceId)
  );
};

const requireOAuthClientRow = async (
  adapter: OAuthAdapter,
  options: OAuthOptions<Scope[]>,
  clientId: string
): Promise<OAuthClientRow> => {
  const row = await findOAuthClientRow(adapter, options, clientId);
  if (!row) {
    throw notFound("OAuth client not found");
  }

  return row;
};

const assertResourcesExist = async (
  adapter: OAuthAdapter,
  options: OAuthOptions<Scope[]>,
  resources: string[]
) => {
  const missing = await findMissingOAuthResource(adapter, options, resources);
  if (missing) {
    throw notFound(`OAuth resource ${missing} not found`);
  }
};

const normalizeCreateInput = (
  input: CreateManagedOAuthClientInput
): CreateManagedOAuthClientInput => ({
  ...input,
  redirectUris: unique(input.redirectUris),
  postLogoutRedirectUris: unique(input.postLogoutRedirectUris),
  scopes: unique(input.scopes),
  resources: unique(input.resources)
});

const normalizeUpdateInput = (
  input: UpdateManagedOAuthClientInput
): UpdateManagedOAuthClientInput => ({
  ...input,
  ...(input.redirectUris
    ? { redirectUris: unique(input.redirectUris) }
    : {}),
  ...(input.postLogoutRedirectUris
    ? { postLogoutRedirectUris: unique(input.postLogoutRedirectUris) }
    : {}),
  ...(input.scopes ? { scopes: unique(input.scopes) } : {}),
  ...(input.resources ? { resources: unique(input.resources) } : {})
});

const updatedRegistration = (
  row: OAuthClientRow,
  update: UpdateManagedOAuthClientInput
): OAuthClient => {
  const profile = oauthClientProfile({
    public: row.public === true,
    grantTypes: row.grantTypes ?? []
  });

  return {
    client_id: row.clientId,
    client_name: update.name ?? row.name ?? row.clientId,
    redirect_uris: update.redirectUris ?? row.redirectUris ?? [],
    post_logout_redirect_uris:
      update.postLogoutRedirectUris ?? row.postLogoutRedirectUris ?? [],
    token_endpoint_auth_method: row.tokenEndpointAuthMethod ?? undefined,
    grant_types: row.grantTypes ?? [],
    response_types: responseTypes(row.responseTypes),
    scope: (update.scopes ?? row.scopes ?? []).join(" "),
    type: clientType(row.type),
    public: row.public === true,
    disabled: row.disabled === true,
    skip_consent:
      profile === OAuthClientProfile.Service
        ? true
        : update.skipConsent ?? row.skipConsent ?? false,
    require_pkce: row.requirePKCE !== false
  };
};

const updateFields = (
  update: UpdateManagedOAuthClientInput,
  registration: OAuthClient
) => ({
  ...(update.name !== undefined ? { name: update.name } : {}),
  ...(update.redirectUris !== undefined
    ? { redirectUris: update.redirectUris }
    : {}),
  ...(update.postLogoutRedirectUris !== undefined
    ? { postLogoutRedirectUris: update.postLogoutRedirectUris }
    : {}),
  ...(update.scopes !== undefined ? { scopes: update.scopes } : {}),
  ...(update.skipConsent !== undefined
    ? { skipConsent: registration.skip_consent }
    : {})
});

const assertProfileInput = (input: CreateManagedOAuthClientInput) => {
  if (input.scopes.length === 0) {
    throw badRequest("At least one OAuth scope is required");
  }
  if (
    input.profile === OAuthClientProfile.Service &&
    input.redirectUris.length > 0
  ) {
    throw badRequest("Service OAuth clients cannot have redirect URIs");
  }
  if (
    input.profile !== OAuthClientProfile.Service &&
    input.redirectUris.length === 0
  ) {
    throw badRequest("Browser OAuth clients require a redirect URI");
  }
};

const storeClientSecret = async (
  options: OAuthOptions<Scope[]>,
  secret: string
) => {
  const storage = options.storeClientSecret;
  if (storage === undefined || storage === "hashed") {
    return oauthClientSecretStorage.hash(secret);
  }
  if (typeof storage === "object" && "hash" in storage) {
    return storage.hash(secret);
  }

  throw internalError(
    "OAuth client management requires hashed client-secret storage"
  );
};

const responseTypes = (values: string[] | null | undefined): "code"[] =>
  values?.includes("code") ? ["code"] : [];

const clientType = (value: string | null | undefined) => {
  if (value === "web" || value === "native" || value === "user-agent-based") {
    return value;
  }

  return undefined;
};

const currentTimestamp = () =>
  new Date(Math.floor(Date.now() / 1_000) * 1_000);

const unique = (values: string[]) => [...new Set(values)];

const badRequest = (message: string) =>
  new APIError("BAD_REQUEST", { message });

const notFound = (message: string) =>
  new APIError("NOT_FOUND", { message });

const internalError = (message: string) =>
  new APIError("INTERNAL_SERVER_ERROR", { message });
