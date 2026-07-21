import {
  OAuthClientProfile,
  type CreateManagedOAuthClientInput,
  type UpdateManagedOAuthClientInput
} from "@nezdemkovski/auth-oauth-client-management";
import {
  OAuthResource,
  OAuthScope,
  oauthResourceIdentifier
} from "@nezdemkovski/auth-oauth-resource";

import type { RegisteredProject } from "../../auth/registry";
import { ErrorCode } from "../../runtime/error-codes";
import {
  AuthConnectionKind,
  isApplicationConnectionClient,
  ServicePermission,
  type CreateAuthConnectionInput,
  type UpdateAuthConnectionInput
} from "./model";

export const APPLICATION_CALLBACK_PATH = "/auth/callback";
const APPLICATION_SCOPES = [
  OAuthScope.OpenId,
  OAuthScope.Profile,
  OAuthScope.Email,
  OAuthScope.OfflineAccess,
  OAuthScope.StorageAvatarWrite,
  OAuthScope.StorageAvatarDelete,
  OAuthScope.BillingUsageRead,
  OAuthScope.BillingCheckoutCreate,
  OAuthScope.BillingPortalRead
];

type AuthConnectionServiceOptions = {
  publicBaseUrl: string;
  enableOAuthProvider: (
    registered: RegisteredProject
  ) => Promise<RegisteredProject>;
};

type ApplicationConnectionRegistry = {
  list(): Array<{
    slug: string;
    appUrl: string;
    features: { oauthProvider: { enabled: boolean } };
  }>;
  get(slug: string): {
    project: { slug: string; appUrl: string };
    auth: {
      oauthClientManagement: {
        list(): Promise<
          Array<{
            clientId: string;
            name: string;
            profile: OAuthClientProfile;
            skipConsent: boolean;
            redirectUris: string[];
            postLogoutRedirectUris: string[];
            scopes: string[];
            resources: string[];
          }>
        >;
        update(
          clientId: string,
          input: UpdateManagedOAuthClientInput
        ): Promise<unknown>;
      };
    };
  } | null;
};

export class AuthConnectionServiceError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: 400 | 404 | 409,
    message: string = code
  ) {
    super(message);
    this.name = "AuthConnectionServiceError";
  }
}

export class AuthConnectionService {
  constructor(private readonly options: AuthConnectionServiceOptions) {}

  list(registered: RegisteredProject) {
    if (!registered.project.features.oauthProvider.enabled) {
      return Promise.resolve([]);
    }
    return registered.auth.oauthClientManagement.list();
  }

  get(registered: RegisteredProject, clientId: string) {
    this.requireEnabled(registered);
    return this.translateErrors(() =>
      registered.auth.oauthClientManagement.get(clientId)
    );
  }

  async create(
    registered: RegisteredProject,
    input: CreateAuthConnectionInput
  ) {
    const enabled = await this.options.enableOAuthProvider(registered);
    if (input.kind === AuthConnectionKind.Application) {
      const existing = await enabled.auth.oauthClientManagement.list();
      if (existing.some(isApplicationConnectionClient)) {
        throw new AuthConnectionServiceError(
          ErrorCode.AppIntegrationExists,
          409,
          "This realm already has an app integration"
        );
      }
    }
    const client = authConnectionClientInput(
      input,
      enabled,
      this.options.publicBaseUrl
    );
    return this.translateErrors(() =>
      enabled.auth.oauthClientManagement.create(client)
    );
  }

  update(
    registered: RegisteredProject,
    clientId: string,
    input: UpdateAuthConnectionInput
  ) {
    this.requireEnabled(registered);
    const update: UpdateManagedOAuthClientInput = { name: input.name };
    return this.translateErrors(() =>
      registered.auth.oauthClientManagement.update(clientId, update)
    );
  }

  setDisabled(
    registered: RegisteredProject,
    clientId: string,
    disabled: boolean
  ) {
    this.requireEnabled(registered);
    return this.translateErrors(() =>
      registered.auth.oauthClientManagement.setDisabled(clientId, disabled)
    );
  }

  async rotateSecret(registered: RegisteredProject, clientId: string) {
    const enabled = await this.options.enableOAuthProvider(registered);
    return this.translateErrors(() =>
      enabled.auth.oauthClientManagement.rotateSecret(clientId)
    );
  }

  delete(registered: RegisteredProject, clientId: string) {
    this.requireEnabled(registered);
    return this.translateErrors(() =>
      registered.auth.oauthClientManagement.delete(clientId)
    );
  }

  private requireEnabled(registered: RegisteredProject) {
    if (!registered.project.features.oauthProvider.enabled) {
      throw new AuthConnectionServiceError(
        ErrorCode.OAuthProviderDisabled,
        409,
        "Authentication connections are not enabled for this realm"
      );
    }
  }

  private async translateErrors<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      const status = errorStatus(error);
      if (status === 404) {
        throw new AuthConnectionServiceError(
          ErrorCode.UnknownOAuthClient,
          404,
          "Authentication connection not found"
        );
      }
      if (status === 400) {
        throw new AuthConnectionServiceError(
          ErrorCode.InvalidOAuthClient,
          400,
          errorMessage(error) ?? "Invalid authentication connection"
        );
      }

      throw error;
    }
  }
}

export const reconcileApplicationConnections = async (
  registry: ApplicationConnectionRegistry,
  publicBaseUrl: string
) => {
  for (const project of registry.list()) {
    if (!project.features.oauthProvider.enabled) {
      continue;
    }
    const registered = registry.get(project.slug);
    if (!registered) {
      continue;
    }
    const clients = await registered.auth.oauthClientManagement.list();
    for (const application of clients.filter(isApplicationConnectionClient)) {
      const desired = authConnectionClientInput(
        {
          kind: AuthConnectionKind.Application,
          name: application.name,
          appUrl: project.appUrl
        },
        registered,
        publicBaseUrl
      );
      if (
        arraysEqual(application.redirectUris, desired.redirectUris) &&
        arraysEqual(
          application.postLogoutRedirectUris,
          desired.postLogoutRedirectUris
        ) &&
        arraysEqual(application.scopes, desired.scopes) &&
        arraysEqual(application.resources, desired.resources)
      ) {
        continue;
      }
      await registered.auth.oauthClientManagement.update(application.clientId, {
        name: desired.name,
        redirectUris: desired.redirectUris,
        postLogoutRedirectUris: desired.postLogoutRedirectUris,
        scopes: desired.scopes,
        resources: desired.resources,
        skipConsent: desired.skipConsent
      });
    }
  }
};

const arraysEqual = (left: string[], right: string[]) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

export const authConnectionClientInput = (
  input: CreateAuthConnectionInput,
  registered: {
    project: Pick<RegisteredProject["project"], "slug" | "appUrl">;
  },
  publicBaseUrl: string
): CreateManagedOAuthClientInput => {
  if (input.kind === AuthConnectionKind.Application) {
    return {
      name: input.name,
      profile: OAuthClientProfile.Public,
      redirectUris: [
        `${input.appUrl}${APPLICATION_CALLBACK_PATH}`,
        `${registered.project.slug}://${APPLICATION_CALLBACK_PATH.slice(1)}`
      ],
      postLogoutRedirectUris: registered.project.appUrl
        ? [registered.project.appUrl]
        : [],
      scopes: APPLICATION_SCOPES,
      resources: [
        oauthResourceIdentifier(
          publicBaseUrl,
          registered.project.slug,
          OAuthResource.Application
        )
      ],
      skipConsent: true
    };
  }

  const scopes: string[] = [];
  const resources: string[] = [];
  for (const permission of input.permissions) {
    if (permission === ServicePermission.BillingUsageWrite) {
      scopes.push(OAuthScope.BillingUsageWrite);
      resources.push(
        oauthResourceIdentifier(
          publicBaseUrl,
          registered.project.slug,
          OAuthResource.Billing
        )
      );
    }
  }

  return {
    name: input.name,
    profile: OAuthClientProfile.Service,
    redirectUris: [],
    postLogoutRedirectUris: [],
    scopes,
    resources,
    skipConsent: true
  };
};

const errorStatus = (error: unknown) => {
  if (!isRecord(error) || typeof error.statusCode !== "number") {
    return null;
  }
  return error.statusCode;
};

const errorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
