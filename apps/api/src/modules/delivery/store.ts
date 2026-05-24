import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

import type { AuthProject } from "../../config/projects";
import { createAdminPool } from "../../db/admin-pool";
import { EmailProvider, type EmailConfig } from "../../email/sender";
import { decryptSecretValue, encryptSecretValue } from "../../db/secret-crypto";
import type { DeliverySettingsPatch } from "./validator";

export type DeliverySettings = {
  provider: EmailConfig["provider"];
  from: string;
  cloudflareAccountId: string;
  cloudflareApiToken: string;
  resendApiKey: string;
  cloudflareApiTokenConfigured: boolean;
  resendApiKeyConfigured: boolean;
  updatedAt: string | null;
};

type DeliverySettingsRow = {
  provider: string;
  fromAddress: string;
  cloudflareAccountId: string;
  cloudflareApiTokenCipher: string;
  resendApiKeyCipher: string;
  updatedAt: Date | string;
};

const SETTINGS_KEY = "default";

export async function ensureDeliverySettingsTable(options: {
  databaseUrl: string;
  adminProject: AuthProject;
}): Promise<void> {
  const pool = createAdminPool(options.databaseUrl, options.adminProject);
  const db = drizzle({ client: pool });

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS auth_delivery_settings (
        key text PRIMARY KEY DEFAULT 'default',
        provider text NOT NULL DEFAULT 'none',
        from_address text NOT NULL DEFAULT '',
        cloudflare_account_id text NOT NULL DEFAULT '',
        cloudflare_api_token_cipher text NOT NULL DEFAULT '',
        resend_api_key_cipher text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  } finally {
    await pool.end();
  }
}

export async function seedDeliverySettingsFromEnv(options: {
  databaseUrl: string;
  adminProject: AuthProject;
  encryptionSecret: string;
  email: EmailConfig;
}): Promise<void> {
  await ensureDeliverySettingsTable(options);
  if (options.email.provider === EmailProvider.None) {
    return;
  }

  const existing = await readDeliverySettingsRow(options);
  if (existing) {
    return;
  }

  const patch: DeliverySettingsPatch =
    options.email.provider === EmailProvider.Resend
      ? {
          provider: EmailProvider.Resend,
          from: options.email.from,
          cloudflareAccountId: "",
          resendApiKey: options.email.apiKey
        }
      : {
          provider: EmailProvider.Cloudflare,
          from: options.email.from,
          cloudflareAccountId: options.email.accountId,
          cloudflareApiToken: options.email.apiToken
        };

  await updateDeliverySettings({
    ...options,
    patch
  });
}

export async function readDeliverySettings(options: {
  databaseUrl: string;
  adminProject: AuthProject;
  encryptionSecret: string;
}): Promise<DeliverySettings> {
  await ensureDeliverySettingsTable(options);
  const row = await readDeliverySettingsRow(options);
  return rowToDeliverySettings(row, options.encryptionSecret);
}

export async function updateDeliverySettings(options: {
  databaseUrl: string;
  adminProject: AuthProject;
  encryptionSecret: string;
  patch: DeliverySettingsPatch;
}): Promise<DeliverySettings> {
  await ensureDeliverySettingsTable(options);

  const current = await readDeliverySettingsRow(options);
  const resendApiKeyCipher =
    options.patch.resendApiKey && options.patch.resendApiKey.trim()
      ? encryptSecret(options.patch.resendApiKey.trim(), options.encryptionSecret, "resend")
      : current?.resendApiKeyCipher ?? "";
  const cloudflareApiTokenCipher =
    options.patch.cloudflareApiToken && options.patch.cloudflareApiToken.trim()
      ? encryptSecret(
          options.patch.cloudflareApiToken.trim(),
          options.encryptionSecret,
          "cloudflare"
        )
      : current?.cloudflareApiTokenCipher ?? "";

  const pool = createAdminPool(options.databaseUrl, options.adminProject);
  const db = drizzle({ client: pool });

  try {
    const result = await db.execute<DeliverySettingsRow>(sql`
      INSERT INTO auth_delivery_settings (
        key,
        provider,
        from_address,
        cloudflare_account_id,
        cloudflare_api_token_cipher,
        resend_api_key_cipher
      )
      VALUES (
        ${SETTINGS_KEY},
        ${options.patch.provider},
        ${options.patch.from.trim()},
        ${options.patch.cloudflareAccountId.trim()},
        ${cloudflareApiTokenCipher},
        ${resendApiKeyCipher}
      )
      ON CONFLICT (key) DO UPDATE
      SET provider = EXCLUDED.provider,
          from_address = EXCLUDED.from_address,
          cloudflare_account_id = EXCLUDED.cloudflare_account_id,
          cloudflare_api_token_cipher = EXCLUDED.cloudflare_api_token_cipher,
          resend_api_key_cipher = EXCLUDED.resend_api_key_cipher,
          updated_at = now()
      RETURNING provider,
                from_address AS "fromAddress",
                cloudflare_account_id AS "cloudflareAccountId",
                cloudflare_api_token_cipher AS "cloudflareApiTokenCipher",
                resend_api_key_cipher AS "resendApiKeyCipher",
                updated_at AS "updatedAt"
    `);

    return rowToDeliverySettings(result.rows[0], options.encryptionSecret);
  } finally {
    await pool.end();
  }
}

async function readDeliverySettingsRow(options: {
  databaseUrl: string;
  adminProject: AuthProject;
}): Promise<DeliverySettingsRow | null> {
  const pool = createAdminPool(options.databaseUrl, options.adminProject);
  const db = drizzle({ client: pool });

  try {
    const result = await db.execute<DeliverySettingsRow>(sql`
      SELECT provider,
             from_address AS "fromAddress",
             cloudflare_account_id AS "cloudflareAccountId",
             cloudflare_api_token_cipher AS "cloudflareApiTokenCipher",
             resend_api_key_cipher AS "resendApiKeyCipher",
             updated_at AS "updatedAt"
      FROM auth_delivery_settings
      WHERE key = ${SETTINGS_KEY}
      LIMIT 1
    `);

    return result.rows[0] ?? null;
  } finally {
    await pool.end();
  }
}

function encryptSecret(value: string, secret: string, key: string): string {
  return encryptSecretValue(value, secret, encryptionContext(key));
}

function decryptSecret(value: string, secret: string, key: string): string {
  if (!value) {
    return "";
  }

  return decryptSecretValue(value, secret, encryptionContext(key));
}

function encryptionContext(key: string): string {
  return `delivery:${key}`;
}

function rowToDeliverySettings(
  row: DeliverySettingsRow | null | undefined,
  encryptionSecret: string
): DeliverySettings {
  if (!row) {
    return {
      provider: EmailProvider.None,
      from: "",
      cloudflareAccountId: "",
      cloudflareApiToken: "",
      resendApiKey: "",
      cloudflareApiTokenConfigured: false,
      resendApiKeyConfigured: false,
      updatedAt: null
    };
  }

  const provider = isDeliveryProvider(row.provider) ? row.provider : EmailProvider.None;
  const cloudflareApiToken = decryptSecret(
    row.cloudflareApiTokenCipher,
    encryptionSecret,
    "cloudflare"
  );
  const resendApiKey = decryptSecret(
    row.resendApiKeyCipher,
    encryptionSecret,
    "resend"
  );

  return {
    provider,
    from: row.fromAddress,
    cloudflareAccountId: row.cloudflareAccountId,
    cloudflareApiToken,
    resendApiKey,
    cloudflareApiTokenConfigured: Boolean(row.cloudflareApiTokenCipher),
    resendApiKeyConfigured: Boolean(row.resendApiKeyCipher),
    updatedAt: normalizeDate(row.updatedAt)
  };
}

function isDeliveryProvider(value: string): value is EmailConfig["provider"] {
  return (
    value === EmailProvider.None ||
    value === EmailProvider.Resend ||
    value === EmailProvider.Cloudflare
  );
}

function normalizeDate(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
