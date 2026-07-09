import type {
  ObservabilitySettings,
  ObservabilitySettingsPatch,
  PublicObservabilityConfig
} from "../types";
import { adminFetch, jsonHeaders, readErrorMessage, readJson } from "./shared";

export async function fetchObservabilityConfig(): Promise<PublicObservabilityConfig> {
  const response = await adminFetch("/admin/api/observability-config", {
    credentials: "include"
  });
  if (!response.ok) throw new Error("Could not load observability config");
  return (await readJson<{ observability: PublicObservabilityConfig }>(response))
    .observability;
}

export async function fetchObservabilitySettings(): Promise<ObservabilitySettings> {
  const response = await adminFetch("/admin/api/observability-settings", {
    credentials: "include"
  });
  if (!response.ok) throw new Error("Could not load observability settings");
  return (await readJson<{ settings: ObservabilitySettings }>(response)).settings;
}

export async function updateObservabilitySettings(
  patch: ObservabilitySettingsPatch
): Promise<ObservabilitySettings> {
  const response = await adminFetch("/admin/api/observability-settings", {
    method: "PATCH",
    credentials: "include",
    headers: jsonHeaders,
    body: JSON.stringify(patch)
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, "Could not save observability settings")
    );
  }

  return (await readJson<{ settings: ObservabilitySettings }>(response)).settings;
}

export async function sendObservabilityTestEvent(): Promise<void> {
  const response = await adminFetch("/admin/api/observability-settings/test", {
    method: "POST",
    credentials: "include"
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not send test event"));
  }
}
