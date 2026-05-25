import { sql } from "drizzle-orm";

import {
  DEFAULT_PLATFORM_OBSERVABILITY,
  ObservabilityProvider,
  type PlatformObservabilitySettings
} from "../../config/projects";
import { type AdminDatabaseOptions, withAdminDb } from "../../db/admin-pool";
import { decryptSecretValue, encryptSecretValue } from "../../db/secret-crypto";
import { isEnumValue } from "../../runtime/enums";
import {
  validateObservabilitySettingsPatch,
  type ObservabilitySettingsPatch
} from "./validator";

export type ObservabilitySettingsState = Omit<
  PlatformObservabilitySettings,
  "dsn"
> & {
  dsnConfigured: boolean;
  updatedAt: string | null;
};

type ObservabilitySettingsRow = {
  key: string;
  provider: string;
  enabled: boolean;
  dsnCipher: string;
  environment: string;
  updatedAt: Date | string;
};

const SETTINGS_KEY = "default";

export const ensureObservabilitySettingsTable = async (
  options: AdminDatabaseOptions
) => {
  await withAdminDb(options, async ({ db }) => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS auth_observability_settings (
        key text PRIMARY KEY DEFAULT 'default',
        provider text NOT NULL DEFAULT 'none',
        enabled boolean NOT NULL DEFAULT false,
        dsn_cipher text NOT NULL DEFAULT '',
        environment text NOT NULL DEFAULT 'production',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  });
};

export const readObservabilitySettings = async (
  options: AdminDatabaseOptions & {
    encryptionSecret: string;
  }
) => {
  const row = await readObservabilitySettingsRow(options);
  return rowToSettings(row, options.encryptionSecret);
};

export const readObservabilitySettingsState = async (
  options: AdminDatabaseOptions
) => {
  const row = await readObservabilitySettingsRow(options);
  return rowToState(row);
};

export const updateObservabilitySettings = async (
  options: AdminDatabaseOptions & {
    encryptionSecret: string;
    patch: ObservabilitySettingsPatch;
  }
) => {
  const current = await readObservabilitySettingsRow(options);
  validateObservabilitySettingsPatch(
    options.patch,
    Boolean(current?.dsnCipher)
  );

  const dsnCipher =
    options.patch.dsn && options.patch.dsn.trim()
      ? await encryptSecret(
          options.patch.dsn.trim(),
          options.encryptionSecret,
          "sentry-dsn"
        )
      : current?.dsnCipher ?? "";

  return withAdminDb(options, async ({ db }) => {
    const result = await db.execute<ObservabilitySettingsRow>(sql`
      INSERT INTO auth_observability_settings (
        key,
        provider,
        enabled,
        dsn_cipher,
        environment
      )
      VALUES (
        ${SETTINGS_KEY},
        ${options.patch.provider},
        ${options.patch.enabled},
        ${dsnCipher},
        ${options.patch.environment}
      )
      ON CONFLICT (key) DO UPDATE
      SET provider = EXCLUDED.provider,
          enabled = EXCLUDED.enabled,
          dsn_cipher = EXCLUDED.dsn_cipher,
          environment = EXCLUDED.environment,
          updated_at = now()
      RETURNING key,
                provider,
                enabled,
                dsn_cipher AS "dsnCipher",
                environment,
                updated_at AS "updatedAt"
    `);

    return rowToSettings(result.rows[0], options.encryptionSecret);
  });
};

const readObservabilitySettingsRow = async (options: AdminDatabaseOptions) => {
  return withAdminDb(options, async ({ db }) => {
    const result = await db.execute<ObservabilitySettingsRow>(sql`
      SELECT key,
             provider,
             enabled,
             dsn_cipher AS "dsnCipher",
             environment,
             updated_at AS "updatedAt"
      FROM auth_observability_settings
      WHERE key = ${SETTINGS_KEY}
      LIMIT 1
    `);

    return result.rows[0] ?? null;
  });
};

const rowToSettings = async (
  row: ObservabilitySettingsRow | null,
  encryptionSecret: string
) => {
  if (!row) {
    return DEFAULT_PLATFORM_OBSERVABILITY;
  }

  const provider = isObservabilityProvider(row.provider)
    ? row.provider
    : ObservabilityProvider.None;
  const dsn = await decryptSecret(row.dsnCipher, encryptionSecret, "sentry-dsn");

  return {
    provider,
    enabled: row.enabled,
    dsn,
    environment: row.environment || DEFAULT_PLATFORM_OBSERVABILITY.environment
  };
};

const rowToState = (row: ObservabilitySettingsRow | null) => {
  if (!row) {
    return {
      provider: DEFAULT_PLATFORM_OBSERVABILITY.provider,
      enabled: DEFAULT_PLATFORM_OBSERVABILITY.enabled,
      environment: DEFAULT_PLATFORM_OBSERVABILITY.environment,
      dsnConfigured: false,
      updatedAt: null
    };
  }

  return {
    provider: isObservabilityProvider(row.provider)
      ? row.provider
      : ObservabilityProvider.None,
    enabled: row.enabled,
    environment: row.environment || DEFAULT_PLATFORM_OBSERVABILITY.environment,
    dsnConfigured: Boolean(row.dsnCipher),
    updatedAt: normalizeDate(row.updatedAt)
  };
};

const encryptSecret = (value: string, secret: string, key: string) => {
  return encryptSecretValue(value, secret, encryptionContext(key));
};

const decryptSecret = (value: string, secret: string, key: string) => {
  if (!value) {
    return "";
  }

  return decryptSecretValue(value, secret, encryptionContext(key));
};

const encryptionContext = (key: string) => {
  return `observability:${key}`;
};

const isObservabilityProvider = (
  value: string
): value is PlatformObservabilitySettings["provider"] => {
  return isEnumValue(ObservabilityProvider, value);
};

const normalizeDate = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};
