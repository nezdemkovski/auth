import { randomHex, sha256Hex } from "@nezdemkovski/auth-platform-crypto";

import {
  MediaUploadPurpose,
  StorageProvider,
  type MediaUploadInput,
  type ProjectStorageSettings
} from "./model";
import type { StorageProviderAccess } from "./ports";
import { MAX_IMAGE_BYTES } from "./validator";

const ALLOWED_IMAGE_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"]
]);

export class MediaUploadError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MediaUploadError";
  }
}

export const createS3StorageProvider = (): StorageProviderAccess => ({
  upload: async (input) => {
    assertStorageConfigured(input.storage);
    validateFile(input.file);

    const mimeType = input.file.type.toLowerCase();
    const extension = ALLOWED_IMAGE_TYPES.get(mimeType);
    if (!extension) {
      throw new MediaUploadError("unsupported_file_type");
    }

    const bytes = new Uint8Array(await input.file.arrayBuffer());
    const objectKey = buildObjectKey(input, extension);
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
      checksumSha256: sha256Hex(bytes)
    };
  },
  delete: async (input) => {
    assertStorageConfigured(input.storage);
    await createS3Client(input.storage).delete(input.objectKey);
  }
});

const validateFile = (file: File) => {
  if (file.size <= 0) {
    throw new MediaUploadError("empty_file");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new MediaUploadError("file_too_large");
  }
};

const sanitizeFileName = (value: string) => {
  return value.trim().replace(/[\\/]+/g, "-").slice(0, 255);
};

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

const buildObjectKey = (input: MediaUploadInput, extension: string) => {
  const token = randomHex(16);
  if (input.purpose === MediaUploadPurpose.ProjectIcon) {
    return `realms/${input.realmSlug}/images/${token}.${extension}`;
  }

  if (!input.ownerUserId) {
    throw new MediaUploadError("owner_required");
  }

  return `realms/${input.realmSlug}/images/${input.ownerUserId}/${token}.${extension}`;
};
