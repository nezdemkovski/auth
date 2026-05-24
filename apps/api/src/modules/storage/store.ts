import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  DEFAULT_PROJECT_STORAGE,
  type AuthProject,
  type ProjectStorageSettings
} from "../../config/projects";
import { decryptSecretValue, encryptSecretValue } from "../../db/secret-crypto";

export type PublicStorageSettings = Omit<
  ProjectStorageSettings,
  "accessKeyId" | "secretAccessKey"
> & {
  accessKeyIdConfigured: boolean;
  secretAccessKeyConfigured: boolean;
  configured: boolean;
};

export type StorageSettingsPatch = {
  provider: ProjectStorageSettings["provider"];
  enabled: boolean;
  endpoint?: string;
  region?: string;
  bucket?: string;
  publicBaseUrl?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
};

type StorageSettingsRow = {
  projectSlug: string;
  provider: string;
  enabled: boolean;
  endpoint: string;
  region: string;
  bucket: string;
  publicBaseUrl: string;
  accessKeyIdCipher: string;
  secretAccessKeyCipher: string;
};

export async function ensureStorageSettingsTable(options: {
  databaseUrl: string;
  adminProject: AuthProject;
}): Promise<void> {
  const pool = createAdminPool(options.databaseUrl, options.adminProject);
  const db = drizzle({ client: pool });

  try {
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
  } finally {
    await pool.end();
  }
}

export async function loadStorageSettings(options: {
  databaseUrl: string;
  adminProject: AuthProject;
  encryptionSecret: string;
  managedStorage: ProjectStorageSettings;
}): Promise<Map<string, ProjectStorageSettings>> {
  await ensureStorageSettingsTable(options);

  const pool = createAdminPool(options.databaseUrl, options.adminProject);
  const db = drizzle({ client: pool });

  try {
    const result = await db.execute<StorageSettingsRow>(sql`
      SELECT project_slug AS "projectSlug",
             provider,
             enabled,
             endpoint,
             region,
             bucket,
             public_base_url AS "publicBaseUrl",
             access_key_id_cipher AS "accessKeyIdCipher",
             secret_access_key_cipher AS "secretAccessKeyCipher"
      FROM auth_storage_settings
    `);

    const byProject = new Map<string, ProjectStorageSettings>();
    for (const row of result.rows) {
      byProject.set(
        row.projectSlug,
        rowToStorage(row, options.encryptionSecret, options.managedStorage)
      );
    }
    return byProject;
  } finally {
    await pool.end();
  }
}

export async function loadProjectStorageSettings(options: {
  databaseUrl: string;
  adminProject: AuthProject;
  project: AuthProject;
  encryptionSecret: string;
  managedStorage: ProjectStorageSettings;
}): Promise<ProjectStorageSettings> {
  const all = await loadStorageSettings(options);
  return all.get(options.project.slug) ?? cloneDefaultStorage(options.managedStorage);
}

export async function readPublicStorageSettings(options: {
  databaseUrl: string;
  adminProject: AuthProject;
  project: AuthProject;
  managedStorage: ProjectStorageSettings;
}): Promise<PublicStorageSettings> {
  await ensureStorageSettingsTable(options);

  const row = await readStorageSettingsRow(options);
  return rowToPublic(row, options.managedStorage);
}

export async function updateStorageSettings(options: {
  databaseUrl: string;
  adminProject: AuthProject;
  project: AuthProject;
  encryptionSecret: string;
  managedStorage: ProjectStorageSettings;
  patch: StorageSettingsPatch;
}): Promise<ProjectStorageSettings> {
  const patch = storagePatchWithManagedDefaults(options.patch, options.managedStorage);
  validateStoragePatch(patch);
  await ensureStorageSettingsTable(options);

  const current = await readStorageSettingsRow(options);
  const accessKeyIdCipher =
    patch.accessKeyId && patch.accessKeyId.trim()
      ? encryptSecret(
          patch.accessKeyId.trim(),
          options.encryptionSecret,
          options.project.slug,
          "access-key-id"
        )
      : current?.accessKeyIdCipher ?? "";
  const secretAccessKeyCipher =
    patch.secretAccessKey && patch.secretAccessKey.trim()
      ? encryptSecret(
          patch.secretAccessKey.trim(),
          options.encryptionSecret,
          options.project.slug,
          "secret-access-key"
        )
      : current?.secretAccessKeyCipher ?? "";

  const pool = createAdminPool(options.databaseUrl, options.adminProject);
  const db = drizzle({ client: pool });

  try {
    const result = await db.execute<StorageSettingsRow>(sql`
      INSERT INTO auth_storage_settings (
        project_slug,
        provider,
        enabled,
        endpoint,
        region,
        bucket,
        public_base_url,
        access_key_id_cipher,
        secret_access_key_cipher
      )
      VALUES (
        ${options.project.slug},
        ${patch.provider},
        ${patch.enabled},
        ${(patch.endpoint ?? "").trim()},
        ${(patch.region ?? "").trim() || "auto"},
        ${(patch.bucket ?? "").trim()},
        ${trimTrailingSlash(patch.publicBaseUrl ?? "")},
        ${accessKeyIdCipher},
        ${secretAccessKeyCipher}
      )
      ON CONFLICT (project_slug) DO UPDATE
      SET provider = EXCLUDED.provider,
          enabled = EXCLUDED.enabled,
          endpoint = EXCLUDED.endpoint,
          region = EXCLUDED.region,
          bucket = EXCLUDED.bucket,
          public_base_url = EXCLUDED.public_base_url,
          access_key_id_cipher = EXCLUDED.access_key_id_cipher,
          secret_access_key_cipher = EXCLUDED.secret_access_key_cipher,
          updated_at = now()
      RETURNING project_slug AS "projectSlug",
                provider,
                enabled,
                endpoint,
                region,
                bucket,
                public_base_url AS "publicBaseUrl",
                access_key_id_cipher AS "accessKeyIdCipher",
                secret_access_key_cipher AS "secretAccessKeyCipher"
    `);

    return rowToStorage(result.rows[0], options.encryptionSecret, options.managedStorage);
  } finally {
    await pool.end();
  }
}

export function cloneDefaultStorage(
  managedStorage: ProjectStorageSettings = DEFAULT_PROJECT_STORAGE
): ProjectStorageSettings {
  if (managedStorage.managed) {
    return {
      ...managedStorage,
      enabled: false
    };
  }

  return {
    ...DEFAULT_PROJECT_STORAGE
  };
}

function rowToStorage(
  row: StorageSettingsRow,
  encryptionSecret: string,
  managedStorage: ProjectStorageSettings
): ProjectStorageSettings {
  if (managedStorage.managed) {
    return {
      ...managedStorage,
      enabled: row.enabled
    };
  }

  const provider = row.provider === "s3" ? "s3" : "none";
  return {
    provider,
    enabled: row.enabled,
    managed: false,
    endpoint: row.endpoint ?? "",
    region: row.region || "auto",
    bucket: row.bucket ?? "",
    publicBaseUrl: row.publicBaseUrl ?? "",
    accessKeyId: decryptSecret(
      row.accessKeyIdCipher,
      encryptionSecret,
      row.projectSlug,
      "access-key-id"
    ),
    secretAccessKey: decryptSecret(
      row.secretAccessKeyCipher,
      encryptionSecret,
      row.projectSlug,
      "secret-access-key"
    )
  };
}

function rowToPublic(
  row: StorageSettingsRow | null,
  managedStorage: ProjectStorageSettings
): PublicStorageSettings {
  if (managedStorage.managed) {
    const enabled = row?.enabled ?? false;
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
      configured: managedStorage.provider === "s3" && enabled
    };
  }

  const provider = row?.provider === "s3" ? "s3" : "none";
  const enabled = row?.enabled ?? false;
  const accessKeyIdConfigured = Boolean(row?.accessKeyIdCipher);
  const secretAccessKeyConfigured = Boolean(row?.secretAccessKeyCipher);
  return {
    provider,
    enabled,
    managed: false,
    endpoint: row?.endpoint ?? "",
    region: row?.region || "auto",
    bucket: row?.bucket ?? "",
    publicBaseUrl: row?.publicBaseUrl ?? "",
    accessKeyIdConfigured,
    secretAccessKeyConfigured,
    configured:
      provider === "s3" &&
      enabled &&
      Boolean(row?.bucket) &&
      Boolean(row?.publicBaseUrl) &&
      accessKeyIdConfigured &&
      secretAccessKeyConfigured
  };
}

async function readStorageSettingsRow(options: {
  databaseUrl: string;
  adminProject: AuthProject;
  project: AuthProject;
}): Promise<StorageSettingsRow | null> {
  const pool = createAdminPool(options.databaseUrl, options.adminProject);
  const db = drizzle({ client: pool });

  try {
    const result = await db.execute<StorageSettingsRow>(sql`
      SELECT project_slug AS "projectSlug",
             provider,
             enabled,
             endpoint,
             region,
             bucket,
             public_base_url AS "publicBaseUrl",
             access_key_id_cipher AS "accessKeyIdCipher",
             secret_access_key_cipher AS "secretAccessKeyCipher"
      FROM auth_storage_settings
      WHERE project_slug = ${options.project.slug}
      LIMIT 1
    `);

    return result.rows[0] ?? null;
  } finally {
    await pool.end();
  }
}

function validateStoragePatch(patch: StorageSettingsPatch): void {
  if (patch.provider !== "none" && patch.provider !== "s3") {
    throw new Error("Invalid storage provider");
  }

  if (patch.provider === "none" || !patch.enabled) {
    return;
  }

  if (!(patch.bucket ?? "").trim()) {
    throw new Error("Storage bucket is required");
  }
  if (!(patch.publicBaseUrl ?? "").trim()) {
    throw new Error("Public base URL is required");
  }
  validateOptionalUrl(patch.endpoint ?? "", "endpoint");
  validateUrl(patch.publicBaseUrl ?? "", "publicBaseUrl");
}

function storagePatchWithManagedDefaults(
  patch: StorageSettingsPatch,
  managedStorage: ProjectStorageSettings
): StorageSettingsPatch {
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
}

function validateOptionalUrl(value: string, field: string): void {
  if (!value.trim()) {
    return;
  }
  validateUrl(value, field);
}

function validateUrl(value: string, field: string): void {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error();
    }
  } catch {
    throw new Error(`Invalid ${field}`);
  }
}

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function encryptSecret(value: string, secret: string, projectSlug: string, key: string): string {
  return encryptSecretValue(value, secret, encryptionContext(projectSlug, key));
}

function decryptSecret(value: string, secret: string, projectSlug: string, key: string): string {
  if (!value) {
    return "";
  }

  return decryptSecretValue(value, secret, encryptionContext(projectSlug, key));
}

function encryptionContext(projectSlug: string, key: string): string {
  return `storage:${projectSlug}:${key}`;
}

function createAdminPool(databaseUrl: string, adminProject: AuthProject): Pool {
  return new Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${adminProject.schema},public`
  });
}

export type StorageObjectPurpose = "project_icon" | "user_avatar";

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
  folder: "images" | "files";
  createdAt: string;
};

export async function ensureStorageObjectsTable(pool: Pool): Promise<void> {
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
}

export async function listStorageObjects(pool: Pool): Promise<StorageObjectSummary[]> {
  await ensureStorageObjectsTable(pool);
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
}

export async function insertStorageObject(
  pool: Pool,
  input: StorageObjectInput
): Promise<void> {
  await ensureStorageObjectsTable(pool);
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
}

function folderFromObjectKey(objectKey: string): "images" | "files" {
  return objectKey.includes("/files/") ? "files" : "images";
}
