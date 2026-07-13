import type {
  CreateManagedOAuthClientInput,
  UpdateManagedOAuthClientInput
} from "@nezdemkovski/auth-oauth-client-management";

import type { RegisteredProject } from "../../auth/registry";
import { ErrorCode } from "../../runtime/error-codes";

export class OAuthClientManagementServiceError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: 400 | 404 | 409,
    message: string = code
  ) {
    super(message);
    this.name = "OAuthClientManagementServiceError";
  }
}

export class OAuthClientManagementService {
  list(registered: RegisteredProject) {
    this.requireEnabled(registered);
    return registered.auth.oauthClientManagement.list();
  }

  get(registered: RegisteredProject, clientId: string) {
    this.requireEnabled(registered);
    return this.translateErrors(() =>
      registered.auth.oauthClientManagement.get(clientId)
    );
  }

  create(
    registered: RegisteredProject,
    input: CreateManagedOAuthClientInput
  ) {
    this.requireEnabled(registered);
    return this.translateErrors(() =>
      registered.auth.oauthClientManagement.create(input)
    );
  }

  update(
    registered: RegisteredProject,
    clientId: string,
    input: UpdateManagedOAuthClientInput
  ) {
    this.requireEnabled(registered);
    return this.translateErrors(() =>
      registered.auth.oauthClientManagement.update(clientId, input)
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

  rotateSecret(registered: RegisteredProject, clientId: string) {
    this.requireEnabled(registered);
    return this.translateErrors(() =>
      registered.auth.oauthClientManagement.rotateSecret(clientId)
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
      throw new OAuthClientManagementServiceError(
        ErrorCode.OAuthProviderDisabled,
        409,
        "OAuth provider is disabled for this realm"
      );
    }
  }

  private async translateErrors<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      const status = errorStatus(error);
      if (status === 404) {
        throw new OAuthClientManagementServiceError(
          ErrorCode.UnknownOAuthClient,
          404,
          "OAuth client not found"
        );
      }
      if (status === 400) {
        throw new OAuthClientManagementServiceError(
          ErrorCode.InvalidOAuthClient,
          400,
          errorMessage(error) ?? "Invalid OAuth client"
        );
      }

      throw error;
    }
  }
}

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
