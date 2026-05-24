import type { StorageObjectSummary } from "./objects-store";
import type { StorageSettingsState } from "./settings-store";

export type PublicStorageSettings = StorageSettingsState;

export type StorageObjectResponse = StorageObjectSummary;

export function storageSettingsResponse(
  settings: StorageSettingsState
): PublicStorageSettings {
  return settings;
}

export function storageObjectResponse(
  object: StorageObjectSummary
): StorageObjectResponse {
  return object;
}
