import type {
  TelegramMiniAppConnection,
  TelegramMiniAppConnectionInput
} from "../types";
import {
  adminFetch,
  jsonHeaders,
  readErrorMessage,
  readJson
} from "./shared";

export const fetchTelegramMiniAppConnection = async (
  project: string
): Promise<TelegramMiniAppConnection> => {
  const response = await adminFetch(
    `/admin/api/projects/${project}/integrations/telegram-mini-app`,
    { credentials: "include" }
  );
  if (!response.ok) {
    throw new Error("Could not load Telegram connection");
  }

  return (
    await readJson<{ connection: TelegramMiniAppConnection }>(response)
  ).connection;
};

export const connectTelegramMiniApp = async (
  input: TelegramMiniAppConnectionInput & { project: string }
): Promise<TelegramMiniAppConnection> => {
  const response = await adminFetch(
    `/admin/api/projects/${input.project}/integrations/telegram-mini-app`,
    {
      method: "PUT",
      credentials: "include",
      headers: jsonHeaders,
      body: JSON.stringify({
        botUsername: input.botUsername,
        botToken: input.botToken
      })
    }
  );
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, "Could not connect Telegram")
    );
  }

  return (
    await readJson<{ connection: TelegramMiniAppConnection }>(response)
  ).connection;
};

export const disconnectTelegramMiniApp = async (project: string) => {
  const response = await adminFetch(
    `/admin/api/projects/${project}/integrations/telegram-mini-app`,
    {
      method: "DELETE",
      credentials: "include"
    }
  );
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, "Could not disconnect Telegram")
    );
  }
};
