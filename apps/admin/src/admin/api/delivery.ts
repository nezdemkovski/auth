import type { DeliverySettings, DeliverySettingsPatch } from "../types";
import { adminFetch, jsonHeaders, readErrorMessage, readJson } from "./shared";

export async function fetchDeliverySettings(): Promise<DeliverySettings> {
  const response = await adminFetch("/admin/api/delivery-settings", {
    credentials: "include"
  });
  if (!response.ok) throw new Error("Could not load delivery settings");
  return (await readJson<{ settings: DeliverySettings }>(response)).settings;
}

export async function updateDeliverySettings(
  patch: DeliverySettingsPatch
): Promise<DeliverySettings> {
  const response = await adminFetch("/admin/api/delivery-settings", {
    method: "PATCH",
    credentials: "include",
    headers: jsonHeaders,
    body: JSON.stringify(patch)
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not save delivery settings"));
  }

  return (await readJson<{ settings: DeliverySettings }>(response)).settings;
}

export async function verifyDeliverySettings(): Promise<void> {
  const response = await adminFetch("/admin/api/delivery-settings/verify", {
    method: "POST",
    credentials: "include"
  });
  if (!response.ok) throw new Error("Could not send test email");
}
