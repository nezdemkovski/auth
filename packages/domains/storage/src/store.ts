import {
  decryptSecretValue,
  encryptSecretValue,
  type AdminDatabaseOptions,
  withAdminDb
} from "@nezdemkovski/auth-platform-database";
import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import {
  StorageObjectFolder,
  StorageObjectStatus,
  type ProjectStorageSettings,
  type StorageObjectInput,
  type StorageSettingsPatch,
  type StoredStorageSettings
} from "./model";
import type { StorageStore } from "./ports";
import { storageObjects, storageSettings } from "./tables";
import { runtimeStorageSettings } from "./translator";

type StorageStoreOptions = AdminDatabaseOptions & {
  encryptionSecret: string;
  managedStorage: ProjectStorageSettings;
};

export const createStorageStore = (
  options: StorageStoreOptions
): StorageStore => ({
  loadRuntimeSettings: () => loadStorageSettings(options),
  readSettings: (projectSlug) =>
    readStorageSettings({
      ...options,
      projectSlug
    }),
  saveSettings: (projectSlug, patch) =>
    updateStorageSettings({
      ...options,
      projectSlug,
      patch
    }),
  listObjects: (pool) => listStorageObjects(pool),
  insertObject: (pool, input) => insertStorageObject(pool, input),
  findObjectByPublicUrl: (pool, publicUrl) =>
    findStorageObjectByPublicUrl(pool, publicUrl),
  markObjectPendingDeletion: (pool, objectKey) =>
    markStorageObjectPendingDeletion(pool, objectKey),
  listPendingObjects: (pool) => listPendingStorageObjects(pool),
  deleteObject: (pool, objectKey) => deleteStorageObject(pool, objectKey)
});

export const ensureStorageSettingsTable = async (
  options: AdminDatabaseOptions
) => {
  await withAdminDb(options, async ({ db }) => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS auth_storage_settings (
        project_slug text PRIMARY KEY REFERENCES auth_project_settings(slug) ON DELETE CASCADE,
        provider text NOT NULL DEFAULT 'none',
        enabled boolean NOT NULL DEFAULT false,
        endpoint text NOT NULL DEFAULT '',
        region text NOT NULL DEFAULT 'auto',
        bucket text NOT NULL DEFAULT '',
        public_base_url text NOT NULL DEFAULT '',
        access_key_id_cipher text NOT NULL DEFAULT '',
        secret_access_key_cipher text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  });
};

export const loadStorageSettings = async (options: StorageStoreOptions) => {
  return withAdminDb(options, async ({ db }) => {
    const rows = await db.select().from(storageSettings);
    const byProject = new Map<string, ProjectStorageSettings>();

    for (const row of rows) {
      byProject.set(
        row.projectSlug,
        await runtimeSettingsFromRow(
          row,
          options.encryptionSecret,
          options.managedStorage
        )
      );
    }

    return byProject;
  });
};

export const loadProjectStorageSettings = async (
  options: StorageStoreOptions & {
    projectSlug: string;
  }
) => {
  const all = await loadStorageSettings(options);
  return all.get(options.projectSlug) ?? null;
};

export const readStorageSettings = async (
  options: AdminDatabaseOptions & {
    projectSlug: string;
  }
) => {
  const row = await readStorageSettingsRow(options);
  return row ? storedSettingsFromRow(row) : null;
};

export const updateStorageSettings = async (
  options: StorageStoreOptions & {
    projectSlug: string;
    patch: StorageSettingsPatch;
  }
) => {
  const current = await readStorageSettingsRow(options);
  const accessKeyIdCipher = await nextSecretCipher({
    value: options.patch.accessKeyId,
    currentCipher: current?.accessKeyIdCipher ?? "",
    secret: options.encryptionSecret,
    projectSlug: options.projectSlug,
    key: "access-key-id"
  });
  const secretAccessKeyCipher = await nextSecretCipher({
    value: options.patch.secretAccessKey,
    currentCipher: current?.secretAccessKeyCipher ?? "",
    secret: options.encryptionSecret,
    projectSlug: options.projectSlug,
    key: "secret-access-key"
  });

  return withAdminDb(options, async ({ db }) => {
    const [row] = await db
      .insert(storageSettings)
      .values({
        projectSlug: options.projectSlug,
        provider: options.patch.provider,
        enabled: options.patch.enabled,
        endpoint: (options.patch.endpoint ?? "").trim(),
        region: (options.patch.region ?? "").trim() || "auto",
        bucket: (options.patch.bucket ?? "").trim(),
        publicBaseUrl: trimTrailingSlash(options.patch.publicBaseUrl ?? ""),
        accessKeyIdCipher,
        secretAccessKeyCipher
      })
      .onConflictDoUpdate({
        target: storageSettings.projectSlug,
        set: {
          provider: options.patch.provider,
          enabled: options.patch.enabled,
          endpoint: (options.patch.endpoint ?? "").trim(),
          region: (options.patch.region ?? "").trim() || "auto",
          bucket: (options.patch.bucket ?? "").trim(),
          publicBaseUrl: trimTrailingSlash(options.patch.publicBaseUrl ?? ""),
          accessKeyIdCipher,
          secretAccessKeyCipher,
          updatedAt: sql`now()`
        }
      })
      .returning();

    return runtimeSettingsFromRow(
      row,
      options.encryptionSecret,
      options.managedStorage
    );
  });
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

export const insertStorageObject = async (
  pool: Pool,
  input: StorageObjectInput
) => {
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

export const findStorageObjectByPublicUrl = async (
  pool: Pool,
  publicUrl: string
) => {
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

export const markStorageObjectPendingDeletion = async (
  pool: Pool,
  objectKey: string
) => {
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

export const deleteStorageObject = async (
  pool: Pool,
  objectKey: string
) => {
  const db = drizzle({ client: pool });
  await db.delete(storageObjects).where(eq(storageObjects.objectKey, objectKey));
};

const readStorageSettingsRow = async (
  options: AdminDatabaseOptions & {
    projectSlug: string;
  }
) => {
  return withAdminDb(options, async ({ db }) => {
    const [row] = await db
      .select()
      .from(storageSettings)
      .where(eq(storageSettings.projectSlug, options.projectSlug))
      .limit(1);

    return row ?? null;
  });
};

const storedSettingsFromRow = (
  row: typeof storageSettings.$inferSelect
): StoredStorageSettings => ({
  projectSlug: row.projectSlug,
  provider: row.provider,
  enabled: row.enabled,
  endpoint: row.endpoint ?? "",
  region: row.region || "auto",
  bucket: row.bucket ?? "",
  publicBaseUrl: row.publicBaseUrl ?? "",
  accessKeyIdConfigured: Boolean(row.accessKeyIdCipher),
  secretAccessKeyConfigured: Boolean(row.secretAccessKeyCipher)
});

const runtimeSettingsFromRow = async (
  row: typeof storageSettings.$inferSelect,
  encryptionSecret: string,
  managedStorage: ProjectStorageSettings
) => {
  const stored = storedSettingsFromRow(row);
  const credentials = managedStorage.managed
    ? { accessKeyId: "", secretAccessKey: "" }
    : {
        accessKeyId: await decryptSecret(
          row.accessKeyIdCipher,
          encryptionSecret,
          row.projectSlug,
          "access-key-id"
        ),
        secretAccessKey: await decryptSecret(
          row.secretAccessKeyCipher,
          encryptionSecret,
          row.projectSlug,
          "secret-access-key"
        )
      };

  return runtimeStorageSettings(stored, credentials, managedStorage);
};

const nextSecretCipher = async (options: {
  value: string | undefined;
  currentCipher: string;
  secret: string;
  projectSlug: string;
  key: string;
}) => {
  if (!options.value?.trim()) {
    return options.currentCipher;
  }

  return encryptSecretValue(
    options.value.trim(),
    options.secret,
    encryptionContext(options.projectSlug, options.key)
  );
};

const decryptSecret = (
  value: string,
  secret: string,
  projectSlug: string,
  key: string
) => {
  if (!value) {
    return "";
  }

  return decryptSecretValue(value, secret, encryptionContext(projectSlug, key));
};

const encryptionContext = (projectSlug: string, key: string) => {
  return `storage:${projectSlug}:${key}`;
};

const trimTrailingSlash = (value: string) => {
  return value.trim().replace(/\/+$/, "");
};

const folderFromObjectKey = (objectKey: string) => {
  return objectKey.includes("/files/")
    ? StorageObjectFolder.Files
    : StorageObjectFolder.Images;
};
