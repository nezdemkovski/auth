import {
  StorageProvider,
  type ProjectStorageSettings,
  type StoredStorageSettings
} from "./model";

export const runtimeStorageSettings = (
  stored: StoredStorageSettings,
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  },
  managedStorage: ProjectStorageSettings
) => {
  if (managedStorage.managed) {
    return {
      ...managedStorage,
      enabled: stored.enabled
    };
  }

  return {
    provider: storageProvider(stored.provider),
    enabled: stored.enabled,
    managed: false,
    endpoint: stored.endpoint,
    region: stored.region || "auto",
    bucket: stored.bucket,
    publicBaseUrl: stored.publicBaseUrl,
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey
  };
};

export const publicStorageSettings = (
  stored: StoredStorageSettings | null,
  managedStorage: ProjectStorageSettings
) => {
  if (managedStorage.managed) {
    const enabled = stored?.enabled ?? false;
    return {
      provider: managedStorage.provider,
      enabled,
      managed: true,
      endpoint: managedStorage.endpoint,
      region: managedStorage.region,
      bucket: managedStorage.bucket,
      publicBaseUrl: managedStorage.publicBaseUrl,
      accessKeyIdConfigured: true,
      secretAccessKeyConfigured: true,
      configured: managedStorage.provider === StorageProvider.S3 && enabled
    };
  }

  const provider = storageProvider(stored?.provider ?? StorageProvider.None);
  const enabled = stored?.enabled ?? false;
  const accessKeyIdConfigured = stored?.accessKeyIdConfigured ?? false;
  const secretAccessKeyConfigured = stored?.secretAccessKeyConfigured ?? false;

  return {
    provider,
    enabled,
    managed: false,
    endpoint: stored?.endpoint ?? "",
    region: stored?.region || "auto",
    bucket: stored?.bucket ?? "",
    publicBaseUrl: stored?.publicBaseUrl ?? "",
    accessKeyIdConfigured,
    secretAccessKeyConfigured,
    configured:
      provider === StorageProvider.S3 &&
      enabled &&
      Boolean(stored?.bucket) &&
      Boolean(stored?.publicBaseUrl) &&
      accessKeyIdConfigured &&
      secretAccessKeyConfigured
  };
};

const storageProvider = (value: string) => {
  return value === StorageProvider.S3
    ? StorageProvider.S3
    : StorageProvider.None;
};
