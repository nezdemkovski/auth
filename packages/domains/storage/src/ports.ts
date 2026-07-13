import type { Pool } from "pg";

import type {
  MediaUploadInput,
  MediaUploadResult,
  ProjectStorageSettings,
  StorageObjectInput,
  StorageObjectSummary,
  StorageSettingsPatch,
  StoredStorageSettings
} from "./model";

export type StorageStore = {
  loadRuntimeSettings(): Promise<Map<string, ProjectStorageSettings>>;
  readSettings(projectSlug: string): Promise<StoredStorageSettings | null>;
  saveSettings(
    projectSlug: string,
    patch: StorageSettingsPatch
  ): Promise<ProjectStorageSettings>;
  listObjects(pool: Pool): Promise<StorageObjectSummary[]>;
  insertObject(pool: Pool, input: StorageObjectInput): Promise<void>;
  findObjectByPublicUrl(
    pool: Pool,
    publicUrl: string
  ): Promise<{ objectKey: string; publicUrl: string } | null>;
  markObjectPendingDeletion(pool: Pool, objectKey: string): Promise<void>;
  listPendingObjects(pool: Pool): Promise<Array<{ objectKey: string }>>;
  deleteObject(pool: Pool, objectKey: string): Promise<void>;
};

export type StorageProviderAccess = {
  upload(input: MediaUploadInput): Promise<MediaUploadResult>;
  delete(input: {
    storage: ProjectStorageSettings;
    objectKey: string;
  }): Promise<void>;
};
