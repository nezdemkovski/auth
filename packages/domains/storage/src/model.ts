import type { Pool } from "pg";

export enum StorageProvider {
  None = "none",
  S3 = "s3"
}

export type ProjectStorageSettings = {
  provider: StorageProvider;
  enabled: boolean;
  managed: boolean;
  endpoint: string;
  region: string;
  bucket: string;
  publicBaseUrl: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export const DEFAULT_PROJECT_STORAGE: ProjectStorageSettings = {
  provider: StorageProvider.None,
  enabled: false,
  managed: false,
  endpoint: "",
  region: "auto",
  bucket: "",
  publicBaseUrl: "",
  accessKeyId: "",
  secretAccessKey: ""
};

export const cloneDefaultStorage = (
  managedStorage: ProjectStorageSettings = DEFAULT_PROJECT_STORAGE
) => {
  if (managedStorage.managed) {
    return {
      ...managedStorage,
      enabled: false
    };
  }

  return {
    ...DEFAULT_PROJECT_STORAGE
  };
};

export type StorageSettingsPatch = {
  provider: StorageProvider;
  enabled: boolean;
  endpoint?: string;
  region?: string;
  bucket?: string;
  publicBaseUrl?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
};

export type StoredStorageSettings = {
  projectSlug: string;
  provider: string;
  enabled: boolean;
  endpoint: string;
  region: string;
  bucket: string;
  publicBaseUrl: string;
  accessKeyIdConfigured: boolean;
  secretAccessKeyConfigured: boolean;
};

export type StorageSettingsState = Omit<
  ProjectStorageSettings,
  "accessKeyId" | "secretAccessKey"
> & {
  accessKeyIdConfigured: boolean;
  secretAccessKeyConfigured: boolean;
  configured: boolean;
};

export type PublicStorageSettings = StorageSettingsState;

export enum MediaUploadPurpose {
  ProjectIcon = "project_icon",
  UserAvatar = "user_avatar"
}

export type MediaUploadInput = {
  storage: ProjectStorageSettings;
  realmSlug: string;
  purpose: MediaUploadPurpose;
  file: File;
  ownerUserId: string | null;
};

export type MediaUploadResult = {
  bucket: string;
  objectKey: string;
  publicUrl: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
};

export type StorageRealm = {
  slug: string;
  storage: ProjectStorageSettings;
  pool: Pool;
};

export enum StorageObjectFolder {
  Images = "images",
  Files = "files"
}

export enum StorageObjectStatus {
  Active = "active",
  DeletePending = "delete_pending"
}

export type StorageObjectInput = MediaUploadResult & {
  purpose: MediaUploadPurpose;
  ownerUserId: string | null;
};

export type StorageObjectSummary = StorageObjectInput & {
  id: string;
  folder: StorageObjectFolder;
  createdAt: string;
};
