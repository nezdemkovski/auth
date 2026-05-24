import type { StorageObjectSummary } from "./objects-store";
import type { StorageSettingsState } from "./settings-store";

export type PublicStorageSettings = StorageSettingsState;

export type StorageObjectResponse = StorageObjectSummary;

export const storageSettingsResponse = (settings: StorageSettingsState) => {
  return settings;
};

export const storageObjectResponse = (object: StorageObjectSummary) => {
  return object;
};
