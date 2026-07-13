import {
  MediaUploadPurpose,
  StorageProvider,
  type ProjectStorageSettings,
  type StorageSettingsPatch
} from "./model";

export type MediaUploadRequest = {
  purpose: MediaUploadPurpose;
  file: File;
};

export const parseMediaUploadRequest = async (
  form: FormData,
  expectedPurpose: MediaUploadPurpose
) => {
  const purpose = form.get("purpose");
  const file = form.get("file");

  if (purpose !== expectedPurpose || !(file instanceof File)) {
    return null;
  }

  return {
    purpose: expectedPurpose,
    file
  };
};

type StorageSettingsBody = Partial<Record<keyof StorageSettingsPatch, unknown>>;

export const parseStorageSettingsPatch = (body: StorageSettingsBody) => {
  const provider = parseStorageProvider(body.provider);
  if (!provider || typeof body.enabled !== "boolean") {
    return null;
  }

  const patch: StorageSettingsPatch = {
    provider,
    enabled: body.enabled,
    endpoint: typeof body.endpoint === "string" ? body.endpoint.trim() : "",
    region: typeof body.region === "string" ? body.region.trim() || "auto" : "auto",
    bucket: typeof body.bucket === "string" ? body.bucket.trim() : "",
    publicBaseUrl:
      typeof body.publicBaseUrl === "string" ? body.publicBaseUrl.trim() : ""
  };

  if (typeof body.accessKeyId === "string" && body.accessKeyId.trim()) {
    patch.accessKeyId = body.accessKeyId.trim();
  }
  if (typeof body.secretAccessKey === "string" && body.secretAccessKey.trim()) {
    patch.secretAccessKey = body.secretAccessKey.trim();
  }

  return patch;
};

export const normalizeStorageSettingsPatch = (
  patch: StorageSettingsPatch,
  managedStorage: ProjectStorageSettings
) => {
  if (!managedStorage.managed) {
    return patch;
  }

  return {
    provider: managedStorage.provider,
    enabled: patch.enabled,
    endpoint: managedStorage.endpoint,
    region: managedStorage.region,
    bucket: managedStorage.bucket,
    publicBaseUrl: managedStorage.publicBaseUrl,
    accessKeyId: managedStorage.accessKeyId,
    secretAccessKey: managedStorage.secretAccessKey
  };
};

export const validateStorageSettingsPatch = (
  patch: StorageSettingsPatch,
  options: {
    allowHttpEndpoint: boolean;
  }
) => {
  validateOptionalStorageEndpoint(
    patch.endpoint ?? "",
    options.allowHttpEndpoint
  );
  validateOptionalUrl(patch.publicBaseUrl ?? "", "publicBaseUrl");

  if (patch.provider === StorageProvider.None || !patch.enabled) {
    return;
  }

  if (!(patch.bucket ?? "").trim()) {
    throw new Error("Storage bucket is required");
  }
  if (!(patch.publicBaseUrl ?? "").trim()) {
    throw new Error("Public base URL is required");
  }
};

export const storageEndpointProtocolIsAllowed = (
  url: URL,
  options: {
    allowHttpEndpoint: boolean;
  }
) => {
  return options.allowHttpEndpoint || url.protocol === "https:";
};

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_MEDIA_UPLOAD_BODY_BYTES = MAX_IMAGE_BYTES + 512 * 1024;

export enum MediaUploadBodyError {
  LengthRequired = "length_required",
  FileTooLarge = "file_too_large"
}

export const mediaUploadBodyError = (contentLength: string | null) => {
  if (!contentLength) {
    return MediaUploadBodyError.LengthRequired;
  }

  const size = Number(contentLength);
  return Number.isFinite(size) && size > MAX_MEDIA_UPLOAD_BODY_BYTES
    ? MediaUploadBodyError.FileTooLarge
    : null;
};

const parseStorageProvider = (value: unknown) => {
  if (value === StorageProvider.None) {
    return StorageProvider.None;
  }
  if (value === StorageProvider.S3) {
    return StorageProvider.S3;
  }
  return null;
};

const validateOptionalUrl = (value: string, field: string) => {
  if (!value.trim()) {
    return;
  }
  validateUrl(value, field);
};

const validateOptionalStorageEndpoint = (
  value: string,
  allowHttpEndpoint: boolean
) => {
  if (!value.trim()) {
    return;
  }

  const url = validateUrl(value, "endpoint");
  if (!storageEndpointProtocolIsAllowed(url, { allowHttpEndpoint })) {
    throw new Error("Storage endpoint must use HTTPS");
  }
};

const validateUrl = (value: string, field: string) => {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error();
    }

    return url;
  } catch {
    throw new Error(`Invalid ${field}`);
  }
};
