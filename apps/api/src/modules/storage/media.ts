import { createHash, randomBytes } from "node:crypto";

import type { ProjectStorageSettings } from "../../config/projects";

export type MediaUploadPurpose = "project_icon" | "user_avatar";

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

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/svg+xml", "svg"]
]);

export async function uploadMedia(input: MediaUploadInput): Promise<MediaUploadResult> {
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
  const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
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
}

export async function deleteUploadedMedia(input: {
  storage: ProjectStorageSettings;
  objectKey: string;
}): Promise<void> {
  assertStorageConfigured(input.storage);

  const client = createS3Client(input.storage);
  await client.delete(input.objectKey);
}

function sanitizeFileName(value: string): string {
  return value.trim().replace(/[\\/]+/g, "-").slice(0, 255);
}

export class MediaUploadError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MediaUploadError";
  }
}

function assertStorageConfigured(storage: ProjectStorageSettings): void {
  if (
    storage.provider !== "s3" ||
    !storage.enabled ||
    !storage.bucket ||
    !storage.publicBaseUrl ||
    !storage.accessKeyId ||
    !storage.secretAccessKey
  ) {
    throw new MediaUploadError("storage_not_configured");
  }
}

function createS3Client(storage: ProjectStorageSettings): Bun.S3Client {
  return new Bun.S3Client({
    bucket: storage.bucket,
    endpoint: storage.endpoint || undefined,
    region: storage.region || "auto",
    accessKeyId: storage.accessKeyId,
    secretAccessKey: storage.secretAccessKey
  });
}

function buildObjectKey(options: {
  realmSlug: string;
  purpose: MediaUploadPurpose;
  ownerUserId: string | null;
  extension: string;
}): string {
  const token = randomBytes(16).toString("hex");
  if (options.purpose === "project_icon") {
    return `realms/${options.realmSlug}/images/${token}.${options.extension}`;
  }

  if (!options.ownerUserId) {
    throw new MediaUploadError("owner_required");
  }

  return `realms/${options.realmSlug}/images/${options.ownerUserId}/${token}.${options.extension}`;
}
