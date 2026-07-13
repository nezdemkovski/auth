import type {
  AuthConnection,
  AuthConnectionCredential,
  AuthConnectionsResponse,
  CreateAuthConnectionInput,
  CreatedAuthConnection
} from "../types";
import {
  adminFetch,
  jsonHeaders,
  readErrorMessage,
  readJson
} from "./shared";

export const fetchAuthConnections = async (
  project: string
): Promise<AuthConnectionsResponse> => {
  const response = await adminFetch(
    `/admin/api/projects/${project}/auth-connections`,
    { credentials: "include" }
  );
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, "Could not load connections")
    );
  }
  return readJson<AuthConnectionsResponse>(response);
};

export const createAuthConnection = async (input: {
  project: string;
  connection: CreateAuthConnectionInput;
}): Promise<CreatedAuthConnection> => {
  const response = await adminFetch(
    `/admin/api/projects/${input.project}/auth-connections`,
    {
      method: "POST",
      credentials: "include",
      headers: jsonHeaders,
      body: JSON.stringify(input.connection)
    }
  );
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, "Could not create connection")
    );
  }
  return readJson<CreatedAuthConnection>(response);
};

export const setAuthConnectionDisabled = async (input: {
  project: string;
  clientId: string;
  disabled: boolean;
}): Promise<AuthConnection> => {
  const action = input.disabled ? "disable" : "enable";
  const response = await adminFetch(
    [
      `/admin/api/projects/${input.project}/auth-connections`,
      encodeURIComponent(input.clientId),
      action
    ].join("/"),
    {
      method: "POST",
      credentials: "include"
    }
  );
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Could not ${input.disabled ? "disable" : "enable"} connection`
      )
    );
  }
  return (await readJson<{ connection: AuthConnection }>(response)).connection;
};

export const rotateAuthConnectionCredential = async (input: {
  project: string;
  clientId: string;
}): Promise<AuthConnectionCredential> => {
  const response = await adminFetch(
    [
      `/admin/api/projects/${input.project}/auth-connections`,
      encodeURIComponent(input.clientId),
      "rotate-credential"
    ].join("/"),
    {
      method: "POST",
      credentials: "include"
    }
  );
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, "Could not rotate credential")
    );
  }
  return (
    await readJson<{ credential: AuthConnectionCredential }>(response)
  ).credential;
};

export const deleteAuthConnection = async (input: {
  project: string;
  clientId: string;
}): Promise<void> => {
  const response = await adminFetch(
    `/admin/api/projects/${input.project}/auth-connections/${encodeURIComponent(input.clientId)}`,
    {
      method: "DELETE",
      credentials: "include"
    }
  );
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, "Could not delete connection")
    );
  }
};
