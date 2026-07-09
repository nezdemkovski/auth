import {
  StorageProvider,
  type ProjectStorageSettings
} from "../../config/projects";
import {
  randomHex,
  sha256Hex
} from "../../runtime/crypto";

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

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_MEDIA_UPLOAD_BODY_BYTES = MAX_IMAGE_BYTES + 512 * 1024;
const ALLOWED_IMAGE_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"]
]);

export const uploadMedia = async (input: MediaUploadInput) => {
  assertStorageConfigured(input.storage);

  if (input.file.size <= 0) {
    throw new MediaUploadError("empty_file");
  }
  if (input.file.size > MAX_IMAGE_BYTES) {
    throw new MediaUploadError("file_too_large");
  }

  const mimeType = input.file.type.toLowerCase();
  const extension = ALLOWED_IMAGE_TYPES.get(mimeType);
  if (!extension) {
    throw new MediaUploadError("unsupported_file_type");
  }

  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const checksumSha256 = sha256Hex(bytes);
  const objectKey = buildObjectKey({
    realmSlug: input.realmSlug,
    purpose: input.purpose,
    ownerUserId: input.ownerUserId,
    extension
  });
  const client = createS3Client(input.storage);

  await client.write(objectKey, bytes, {
    type: mimeType,
    acl: "public-read"
  });

  return {
    bucket: input.storage.bucket,
    objectKey,
    publicUrl: `${input.storage.publicBaseUrl.replace(/\/+$/, "")}/${objectKey}`,
    originalFileName: sanitizeFileName(input.file.name),
    mimeType,
    sizeBytes: input.file.size,
    checksumSha256
  };
};

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

export const deleteUploadedMedia = async (input: {
  storage: ProjectStorageSettings;
  objectKey: string;
}) => {
  assertStorageConfigured(input.storage);

  const client = createS3Client(input.storage);
  await client.delete(input.objectKey);
};

const sanitizeFileName = (value: string) => {
  return value.trim().replace(/[\\/]+/g, "-").slice(0, 255);
};

export class MediaUploadError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MediaUploadError";
  }
}

const assertStorageConfigured = (storage: ProjectStorageSettings) => {
  if (
    storage.provider !== StorageProvider.S3 ||
    !storage.enabled ||
    !storage.bucket ||
    !storage.publicBaseUrl ||
    !storage.accessKeyId ||
    !storage.secretAccessKey
  ) {
    throw new MediaUploadError("storage_not_configured");
  }
};

const createS3Client = (storage: ProjectStorageSettings) => {
  return new Bun.S3Client({
    bucket: storage.bucket,
    endpoint: storage.endpoint || undefined,
    region: storage.region || "auto",
    accessKeyId: storage.accessKeyId,
    secretAccessKey: storage.secretAccessKey
  });
};

const buildObjectKey = (options: {
  realmSlug: string;
  purpose: MediaUploadPurpose;
  ownerUserId: string | null;
  extension: string;
}) => {
  const token = randomHex(16);
  if (options.purpose === MediaUploadPurpose.ProjectIcon) {
    return `realms/${options.realmSlug}/images/${token}.${options.extension}`;
  }

  if (!options.ownerUserId) {
    throw new MediaUploadError("owner_required");
  }

  return `realms/${options.realmSlug}/images/${options.ownerUserId}/${token}.${options.extension}`;
};
