import { desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import { MediaUploadPurpose } from "./media";
import { storageObjects } from "./tables";

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

  const rows = await db
    .select()
    .from(storageObjects)
    .orderBy(desc(storageObjects.createdAt))
    .limit(200);

  return rows.map((row) => ({
    id: row.id,
    purpose: row.purpose,
    folder: folderFromObjectKey(row.objectKey),
    bucket: row.bucket,
    objectKey: row.objectKey,
    publicUrl: row.publicUrl,
    originalFileName: row.originalFileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    checksumSha256: row.checksumSha256,
    ownerUserId: row.ownerUserId,
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt
  }));
};

export const insertStorageObject = async (pool: Pool, input: StorageObjectInput) => {
  const db = drizzle({ client: pool });

  await db.insert(storageObjects).values({
    id: crypto.randomUUID(),
    purpose: input.purpose,
    bucket: input.bucket,
    objectKey: input.objectKey,
    publicUrl: input.publicUrl,
    originalFileName: input.originalFileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    checksumSha256: input.checksumSha256,
    ownerUserId: input.ownerUserId
  });
};

const folderFromObjectKey = (objectKey: string) => {
  return objectKey.includes("/files/")
    ? StorageObjectFolder.Files
    : StorageObjectFolder.Images;
};
