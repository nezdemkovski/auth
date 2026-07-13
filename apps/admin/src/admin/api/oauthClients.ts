import type {
  CreateOAuthClientInput,
  CreatedOAuthClient,
  OAuthClient,
  OAuthClientCredential,
  OAuthClientsResponse
} from "../types";
import {
  adminFetch,
  jsonHeaders,
  readErrorMessage,
  readJson
} from "./shared";

export const fetchOAuthClients = async (
  project: string
): Promise<OAuthClientsResponse> => {
  const response = await adminFetch(`/admin/api/projects/${project}/oauth-clients`, {
    credentials: "include"
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not load OAuth clients"));
  }
  return readJson<OAuthClientsResponse>(response);
};

export const createOAuthClient = async (input: {
  project: string;
  client: CreateOAuthClientInput;
}): Promise<CreatedOAuthClient> => {
  const response = await adminFetch(
    `/admin/api/projects/${input.project}/oauth-clients`,
    {
      method: "POST",
      credentials: "include",
      headers: jsonHeaders,
      body: JSON.stringify(input.client)
    }
  );
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not create OAuth client"));
  }
  return readJson<CreatedOAuthClient>(response);
};

export const setOAuthClientDisabled = async (input: {
  project: string;
  clientId: string;
  disabled: boolean;
}): Promise<OAuthClient> => {
  const action = input.disabled ? "disable" : "enable";
  const response = await adminFetch(
    [
      `/admin/api/projects/${input.project}/oauth-clients`,
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
        `Could not ${input.disabled ? "disable" : "enable"} OAuth client`
      )
    );
  }
  return (await readJson<{ client: OAuthClient }>(response)).client;
};

export const rotateOAuthClientSecret = async (input: {
  project: string;
  clientId: string;
}): Promise<OAuthClientCredential> => {
  const response = await adminFetch(
    [
      `/admin/api/projects/${input.project}/oauth-clients`,
      encodeURIComponent(input.clientId),
      "rotate-secret"
    ].join("/"),
    {
      method: "POST",
      credentials: "include"
    }
  );
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not rotate client secret"));
  }
  return (await readJson<{ credential: OAuthClientCredential }>(response)).credential;
};

export const deleteOAuthClient = async (input: {
  project: string;
  clientId: string;
}): Promise<void> => {
  const response = await adminFetch(
    `/admin/api/projects/${input.project}/oauth-clients/${encodeURIComponent(input.clientId)}`,
    {
      method: "DELETE",
      credentials: "include"
    }
  );
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not delete OAuth client"));
  }
};
