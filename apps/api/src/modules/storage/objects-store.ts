import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import { MediaUploadPurpose } from "./media";
import { storageObjects } from "./tables";

export type StorageObjectPurpose = MediaUploadPurpose;

export enum StorageObjectFolder {
  Images = "images",
  Files = "files"
}

export enum StorageObjectStatus {
  Active = "active",
  DeletePending = "delete_pending"
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
      status text NOT NULL DEFAULT 'active',
      superseded_at timestamptz,
      delete_attempts integer NOT NULL DEFAULT 0,
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
  await db.execute(sql`
    ALTER TABLE auth_storage_objects
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
  `);
  await db.execute(sql`
    ALTER TABLE auth_storage_objects
    ADD COLUMN IF NOT EXISTS superseded_at timestamptz
  `);
  await db.execute(sql`
    ALTER TABLE auth_storage_objects
    ADD COLUMN IF NOT EXISTS delete_attempts integer NOT NULL DEFAULT 0
  `);
};

export const listStorageObjects = async (pool: Pool) => {
  const db = drizzle({ client: pool });

  const rows = await db
    .select()
    .from(storageObjects)
    .where(eq(storageObjects.status, StorageObjectStatus.Active))
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

export const findStorageObjectByPublicUrl = async (pool: Pool, publicUrl: string) => {
  const db = drizzle({ client: pool });
  const rows = await db
    .select({
      objectKey: storageObjects.objectKey,
      publicUrl: storageObjects.publicUrl
    })
    .from(storageObjects)
    .where(
      and(
        eq(storageObjects.publicUrl, publicUrl),
        eq(storageObjects.status, StorageObjectStatus.Active)
      )
    )
    .limit(1);

  return rows[0] ?? null;
};

export const markStorageObjectPendingDeletion = async (pool: Pool, objectKey: string) => {
  const db = drizzle({ client: pool });
  await db
    .update(storageObjects)
    .set({
      status: StorageObjectStatus.DeletePending,
      supersededAt: sql`now()`,
      deleteAttempts: sql`${storageObjects.deleteAttempts} + 1`
    })
    .where(eq(storageObjects.objectKey, objectKey));
};

export const listPendingStorageObjects = async (pool: Pool) => {
  const db = drizzle({ client: pool });
  return db
    .select({ objectKey: storageObjects.objectKey })
    .from(storageObjects)
    .where(eq(storageObjects.status, StorageObjectStatus.DeletePending))
    .orderBy(storageObjects.supersededAt)
    .limit(100);
};

export const deleteStorageObject = async (pool: Pool, objectKey: string) => {
  const db = drizzle({ client: pool });
  await db
    .delete(storageObjects)
    .where(eq(storageObjects.objectKey, objectKey));
};

const folderFromObjectKey = (objectKey: string) => {
  return objectKey.includes("/files/")
    ? StorageObjectFolder.Files
    : StorageObjectFolder.Images;
};
