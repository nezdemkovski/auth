import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import { MediaUploadPurpose } from "./media";

export type StorageObjectPurpose = MediaUploadPurpose;

export enum StorageObjectFolder {
  Images = "images",
  Files = "files"
}

export type StorageObjectInput = {
  purpose: StorageObjectPurpose;
  bucket: string;
  objectKey: string;
  publicUrl: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  ownerUserId: string | null;
};

export type StorageObjectSummary = StorageObjectInput & {
  id: string;
  folder: StorageObjectFolder;
  createdAt: string;
};

export const ensureStorageObjectsTable = async (pool: Pool) => {
  const db = drizzle({ client: pool });

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS auth_storage_objects (
      id text PRIMARY KEY,
      purpose text NOT NULL,
      bucket text NOT NULL,
      object_key text NOT NULL,
      public_url text NOT NULL,
      original_file_name text NOT NULL DEFAULT '',
      mime_type text NOT NULL,
      size_bytes integer NOT NULL,
      checksum_sha256 text NOT NULL,
      owner_user_id text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS auth_storage_objects_object_key_key
    ON auth_storage_objects (object_key)
  `);

  await db.execute(sql`
    ALTER TABLE auth_storage_objects
    ADD COLUMN IF NOT EXISTS original_file_name text NOT NULL DEFAULT ''
  `);
};

export const listStorageObjects = async (pool: Pool) => {
  const db = drizzle({ client: pool });

  const result = await db.execute<{
    id: string;
    purpose: StorageObjectPurpose;
    bucket: string;
    object_key: string;
    public_url: string;
    original_file_name: string;
    mime_type: string;
    size_bytes: number;
    checksum_sha256: string;
    owner_user_id: string | null;
    created_at: Date | string;
  }>(sql`
    SELECT
      id,
      purpose,
      bucket,
      object_key,
      public_url,
      original_file_name,
      mime_type,
      size_bytes,
      checksum_sha256,
      owner_user_id,
      created_at
    FROM auth_storage_objects
    ORDER BY created_at DESC
    LIMIT 200
  `);

  return result.rows.map((row) => ({
    id: row.id,
    purpose: row.purpose,
    folder: folderFromObjectKey(row.object_key),
    bucket: row.bucket,
    objectKey: row.object_key,
    publicUrl: row.public_url,
    originalFileName: row.original_file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    checksumSha256: row.checksum_sha256,
    ownerUserId: row.owner_user_id,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  }));
};

export const insertStorageObject = async (pool: Pool, input: StorageObjectInput) => {
  const db = drizzle({ client: pool });

  await db.execute(sql`
    INSERT INTO auth_storage_objects (
      id,
      purpose,
      bucket,
      object_key,
      public_url,
      original_file_name,
      mime_type,
      size_bytes,
      checksum_sha256,
      owner_user_id
    )
    VALUES (
      ${crypto.randomUUID()},
      ${input.purpose},
      ${input.bucket},
      ${input.objectKey},
      ${input.publicUrl},
      ${input.originalFileName},
      ${input.mimeType},
      ${input.sizeBytes},
      ${input.checksumSha256},
      ${input.ownerUserId}
    )
  `);
};

const folderFromObjectKey = (objectKey: string) => {
  return objectKey.includes("/files/")
    ? StorageObjectFolder.Files
    : StorageObjectFolder.Images;
};
