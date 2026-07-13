import { eq, sql } from "drizzle-orm";
import {
  decryptSecretValue,
  encryptSecretValue,
  type AdminDatabaseOptions,
  withAdminDb
} from "@nezdemkovski/auth-platform-database";

import {
  DEFAULT_PLATFORM_OBSERVABILITY,
  isObservabilityProvider,
  ObservabilityProvider,
  type PlatformObservabilitySettings
} from "./model";
import { observabilitySettings } from "./tables";
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
    const [row] = await db
      .insert(observabilitySettings)
      .values({
        key: SETTINGS_KEY,
        provider: options.patch.provider,
        enabled: options.patch.enabled,
        dsnCipher,
        environment: options.patch.environment
      })
      .onConflictDoUpdate({
        target: observabilitySettings.key,
        set: {
          provider: options.patch.provider,
          enabled: options.patch.enabled,
          dsnCipher,
          environment: options.patch.environment,
          updatedAt: sql`now()`
        }
      })
      .returning();

    return rowToSettings(row, options.encryptionSecret);
  });
};

const readObservabilitySettingsRow = async (options: AdminDatabaseOptions) => {
  return withAdminDb(options, async ({ db }) => {
    const [row] = await db
      .select()
      .from(observabilitySettings)
      .where(eq(observabilitySettings.key, SETTINGS_KEY))
      .limit(1);

    return row ?? null;
  });
};

const rowToSettings = async (
  row: typeof observabilitySettings.$inferSelect | null,
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

const rowToState = (row: typeof observabilitySettings.$inferSelect | null) => {
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

const normalizeDate = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};
