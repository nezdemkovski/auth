import { eq, sql } from "drizzle-orm";

import { type AdminDatabaseOptions, withAdminDb } from "../../db/admin-pool";
import { EmailProvider, type EmailConfig } from "../../email/sender";
import { decryptSecretValue, encryptSecretValue } from "../../db/secret-crypto";
import { isEnumValue } from "../../runtime/enums";
import { deliverySettings } from "./tables";
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

const SETTINGS_KEY = "default";

export const ensureDeliverySettingsTable = async (options: AdminDatabaseOptions) => {
  await withAdminDb(options, async ({ db }) => {
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
  });
};

export const seedDeliverySettingsFromEnv = async (options: AdminDatabaseOptions & {
  encryptionSecret: string;
  email: EmailConfig;
}) => {
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
};

export const readDeliverySettings = async (options: AdminDatabaseOptions & {
  encryptionSecret: string;
}) => {
  const row = await readDeliverySettingsRow(options);
  return rowToDeliverySettings(row, options.encryptionSecret);
};

export const updateDeliverySettings = async (options: AdminDatabaseOptions & {
  encryptionSecret: string;
  patch: DeliverySettingsPatch;
}) => {
  const current = await readDeliverySettingsRow(options);
  const resendApiKeyCipher =
    options.patch.resendApiKey && options.patch.resendApiKey.trim()
      ? await encryptSecret(
          options.patch.resendApiKey.trim(),
          options.encryptionSecret,
          EmailProvider.Resend
        )
      : current?.resendApiKeyCipher ?? "";
  const cloudflareApiTokenCipher =
    options.patch.cloudflareApiToken && options.patch.cloudflareApiToken.trim()
      ? await encryptSecret(
          options.patch.cloudflareApiToken.trim(),
          options.encryptionSecret,
          EmailProvider.Cloudflare
        )
      : current?.cloudflareApiTokenCipher ?? "";

  return withAdminDb(options, async ({ db }) => {
    const [row] = await db
      .insert(deliverySettings)
      .values({
        key: SETTINGS_KEY,
        provider: options.patch.provider,
        fromAddress: options.patch.from.trim(),
        cloudflareAccountId: options.patch.cloudflareAccountId.trim(),
        cloudflareApiTokenCipher,
        resendApiKeyCipher
      })
      .onConflictDoUpdate({
        target: deliverySettings.key,
        set: {
          provider: options.patch.provider,
          fromAddress: options.patch.from.trim(),
          cloudflareAccountId: options.patch.cloudflareAccountId.trim(),
          cloudflareApiTokenCipher,
          resendApiKeyCipher,
          updatedAt: sql`now()`
        }
      })
      .returning();

    return rowToDeliverySettings(row, options.encryptionSecret);
  });
};

const readDeliverySettingsRow = async (options: AdminDatabaseOptions) => {
  return withAdminDb(options, async ({ db }) => {
    const [row] = await db
      .select()
      .from(deliverySettings)
      .where(eq(deliverySettings.key, SETTINGS_KEY))
      .limit(1);

    return row ?? null;
  });
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
  return `delivery:${key}`;
};

const rowToDeliverySettings = async (
  row: typeof deliverySettings.$inferSelect | null | undefined,
  encryptionSecret: string
) => {
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
  const cloudflareApiToken = await decryptSecret(
    row.cloudflareApiTokenCipher,
    encryptionSecret,
    EmailProvider.Cloudflare
  );
  const resendApiKey = await decryptSecret(
    row.resendApiKeyCipher,
    encryptionSecret,
    EmailProvider.Resend
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
};

const isDeliveryProvider = (value: string): value is EmailConfig["provider"] => {
  return isEnumValue(EmailProvider, value);
};

const normalizeDate = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};
