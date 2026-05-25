import { sql } from "drizzle-orm";

import {
  DEFAULT_PROJECT_STORAGE,
  StorageProvider,
  type AuthProject,
  type ProjectStorageSettings
} from "../../config/projects";
import { type AdminDatabaseOptions, withAdminDb } from "../../db/admin-pool";
import { decryptSecretValue, encryptSecretValue } from "../../db/secret-crypto";
import { isEnumValue } from "../../runtime/enums";
import { storageSettingsResponse } from "./translator";
import type { PublicStorageSettings } from "./translator";

export type StorageSettingsState = Omit<
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

export const ensureStorageSettingsTable = async (options: AdminDatabaseOptions) => {
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

export const loadStorageSettings = async (options: AdminDatabaseOptions & {
  encryptionSecret: string;
  managedStorage: ProjectStorageSettings;
}) => {
  await ensureStorageSettingsTable(options);

  return withAdminDb(options, async ({ db }) => {
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
  });
};

export const loadProjectStorageSettings = async (options: AdminDatabaseOptions & {
  project: AuthProject;
  encryptionSecret: string;
  managedStorage: ProjectStorageSettings;
}) => {
  const all = await loadStorageSettings(options);
  return all.get(options.project.slug) ?? cloneDefaultStorage(options.managedStorage);
};

export const readPublicStorageSettings = async (options: AdminDatabaseOptions & {
  project: AuthProject;
  managedStorage: ProjectStorageSettings;
}) => {
  await ensureStorageSettingsTable(options);

  const row = await readStorageSettingsRow(options);
  return storageSettingsResponse(rowToState(row, options.managedStorage));
};

export const updateStorageSettings = async (options: AdminDatabaseOptions & {
  project: AuthProject;
  encryptionSecret: string;
  managedStorage: ProjectStorageSettings;
  patch: StorageSettingsPatch;
}) => {
  const patch = storagePatchWithManagedDefaults(options.patch, options.managedStorage);
  validateStoragePatch(patch, {
    allowHttpEndpoint: options.managedStorage.managed
  });
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

  return withAdminDb(options, async ({ db }) => {
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
  });
};

export const cloneDefaultStorage = (managedStorage: ProjectStorageSettings = DEFAULT_PROJECT_STORAGE) => {
  if (managedStorage.managed) {
    return {
      ...managedStorage,
      enabled: false
    };
  }

  return {
    ...DEFAULT_PROJECT_STORAGE
  };
};

const rowToStorage = (row: StorageSettingsRow, encryptionSecret: string, managedStorage: ProjectStorageSettings) => {
  if (managedStorage.managed) {
    return {
      ...managedStorage,
      enabled: row.enabled
    };
  }

  const provider =
    row.provider === StorageProvider.S3 ? StorageProvider.S3 : StorageProvider.None;
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
};

const rowToState = (row: StorageSettingsRow | null, managedStorage: ProjectStorageSettings) => {
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
      configured: managedStorage.provider === StorageProvider.S3 && enabled
    };
  }

  const provider =
    row?.provider === StorageProvider.S3 ? StorageProvider.S3 : StorageProvider.None;
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
      provider === StorageProvider.S3 &&
      enabled &&
      Boolean(row?.bucket) &&
      Boolean(row?.publicBaseUrl) &&
      accessKeyIdConfigured &&
      secretAccessKeyConfigured
  };
};

const readStorageSettingsRow = async (options: AdminDatabaseOptions & {
  project: AuthProject;
}) => {
  return withAdminDb(options, async ({ db }) => {
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
  });
};

const validateStoragePatch = (
  patch: StorageSettingsPatch,
  options: {
    allowHttpEndpoint: boolean;
  }
) => {
  if (!isEnumValue(StorageProvider, patch.provider)) {
    throw new Error("Invalid storage provider");
  }

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

const storagePatchWithManagedDefaults = (patch: StorageSettingsPatch, managedStorage: ProjectStorageSettings) => {
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

export const storageEndpointProtocolIsAllowed = (
  url: URL,
  options: {
    allowHttpEndpoint: boolean;
  }
) => {
  return options.allowHttpEndpoint || url.protocol === "https:";
};

const trimTrailingSlash = (value: string) => {
  return value.trim().replace(/\/+$/, "");
};

const encryptSecret = (value: string, secret: string, projectSlug: string, key: string) => {
  return encryptSecretValue(value, secret, encryptionContext(projectSlug, key));
};

const decryptSecret = (value: string, secret: string, projectSlug: string, key: string) => {
  if (!value) {
    return "";
  }

  return decryptSecretValue(value, secret, encryptionContext(projectSlug, key));
};

const encryptionContext = (projectSlug: string, key: string) => {
  return `storage:${projectSlug}:${key}`;
};
