import {
  decryptSecretValue,
  encryptSecretValue,
  type AdminDatabaseOptions,
  withAdminDb
} from "@nezdemkovski/auth-platform-database";
import { eq, sql } from "drizzle-orm";

import {
  BillingEnvironment,
  BillingProductType,
  BillingProvider,
  EntitlementGrantType,
  EntitlementResetPeriod,
  cloneDefaultBilling,
  type ProjectBillingSettings
} from "./model";
import { isEnumValue, isRecord } from "./guards";
import { billingSettings } from "./tables";
import type { BillingSettingsPatch } from "./validator";

type BillingSettingsRow = {
  projectSlug: string;
  provider: string;
  enabled: boolean;
  environment: string;
  organizationId: string;
  accessTokenCipher: string;
  webhookSecretCipher: string;
  freeEntitlements: unknown;
  products: unknown;
};

export const ensureBillingSettingsTable = async (options: AdminDatabaseOptions) => {
  await withAdminDb(options, async ({ db }) => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS auth_billing_settings (
        project_slug text PRIMARY KEY REFERENCES auth_project_settings(slug) ON DELETE CASCADE,
        provider text NOT NULL DEFAULT 'none',
        enabled boolean NOT NULL DEFAULT false,
        environment text NOT NULL DEFAULT 'sandbox',
        organization_id text NOT NULL DEFAULT '',
        access_token_cipher text NOT NULL DEFAULT '',
        webhook_secret_cipher text NOT NULL DEFAULT '',
        free_entitlements jsonb NOT NULL DEFAULT '[]'::jsonb,
        products jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      ALTER TABLE auth_billing_settings
      ADD COLUMN IF NOT EXISTS organization_id text NOT NULL DEFAULT ''
    `);
    await db.execute(sql`
      ALTER TABLE auth_billing_settings
      ADD COLUMN IF NOT EXISTS free_entitlements jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
  });
};

export const loadBillingSettings = async (options: AdminDatabaseOptions & {
  encryptionSecret: string;
}) => {
  return withAdminDb(options, async ({ db }) => {
    const rows = await db.select().from(billingSettings);

    const byProject = new Map<string, ProjectBillingSettings>();
    for (const row of rows) {
      byProject.set(
        row.projectSlug,
        await rowToBilling(row, options.encryptionSecret)
      );
    }
    return byProject;
  });
};

export const loadProjectBillingSettings = async (options: AdminDatabaseOptions & {
  projectSlug: string;
  encryptionSecret: string;
}) => {
  const all = await loadBillingSettings(options);
  return all.get(options.projectSlug) ?? cloneDefaultBilling();
};

export const readBillingSettingsState = async (options: AdminDatabaseOptions & {
  projectSlug: string;
}) => {
  return withAdminDb(options, async ({ db }) => {
    const rows = await db
      .select()
      .from(billingSettings)
      .where(eq(billingSettings.projectSlug, options.projectSlug))
      .limit(1);

    return rowToState(rows[0]);
  });
};

export const updateBillingSettings = async (options: AdminDatabaseOptions & {
  projectSlug: string;
  encryptionSecret: string;
  patch: BillingSettingsPatch;
}) => {
  const current = await readBillingSettingsRow(options);
  const accessTokenCipher =
    options.patch.accessToken && options.patch.accessToken.trim()
      ? await encryptSecret(
          options.patch.accessToken.trim(),
          options.encryptionSecret,
          options.projectSlug,
          "access-token"
        )
      : current?.accessTokenCipher ?? "";
  const webhookSecretCipher =
    options.patch.webhookSecret && options.patch.webhookSecret.trim()
      ? await encryptSecret(
          options.patch.webhookSecret.trim(),
          options.encryptionSecret,
          options.projectSlug,
          "webhook-secret"
        )
      : current?.webhookSecretCipher ?? "";

  return withAdminDb(options, async ({ db }) => {
    const rows = await db
      .insert(billingSettings)
      .values({
        projectSlug: options.projectSlug,
        provider: options.patch.provider,
        enabled: options.patch.enabled,
        environment: options.patch.environment,
        organizationId: options.patch.organizationId?.trim() ?? "",
        accessTokenCipher,
        webhookSecretCipher,
        freeEntitlements: options.patch.freeEntitlements,
        products: options.patch.products
      })
      .onConflictDoUpdate({
        target: billingSettings.projectSlug,
        set: {
          provider: options.patch.provider,
          enabled: options.patch.enabled,
          environment: options.patch.environment,
          organizationId: options.patch.organizationId?.trim() ?? "",
          accessTokenCipher,
          webhookSecretCipher,
          freeEntitlements: options.patch.freeEntitlements,
          products: options.patch.products,
          updatedAt: sql`now()`
        }
      })
      .returning();

    return rowToBilling(rows[0], options.encryptionSecret);
  });
};

const rowToBilling = async (row: BillingSettingsRow, encryptionSecret: string) => {
  const provider =
    row.provider === BillingProvider.Polar ? BillingProvider.Polar : BillingProvider.None;
  const environment =
    row.environment === BillingEnvironment.Production
      ? BillingEnvironment.Production
      : BillingEnvironment.Sandbox;
  return {
    provider,
    enabled: row.enabled,
    environment,
    organizationId: row.organizationId ?? "",
    accessToken: await decryptSecret(
      row.accessTokenCipher,
      encryptionSecret,
      row.projectSlug,
      "access-token"
    ),
    webhookSecret: await decryptSecret(
      row.webhookSecretCipher,
      encryptionSecret,
      row.projectSlug,
      "webhook-secret"
    ),
    freeEntitlements: normalizeEntitlements(row.freeEntitlements),
    products: normalizeBillingProducts(row.products)
  };
};

const rowToState = (row: BillingSettingsRow | undefined) => {
  const products = normalizeBillingProducts(row?.products ?? []);
  const freeEntitlements = normalizeEntitlements(row?.freeEntitlements ?? []);
  const provider =
    row?.provider === BillingProvider.Polar ? BillingProvider.Polar : BillingProvider.None;
  const environment =
    row?.environment === BillingEnvironment.Production
      ? BillingEnvironment.Production
      : BillingEnvironment.Sandbox;
  return {
    provider,
    enabled: row?.enabled ?? false,
    environment,
    organizationId: row?.organizationId ?? "",
    accessTokenConfigured: Boolean(row?.accessTokenCipher),
    webhookSecretConfigured: Boolean(row?.webhookSecretCipher),
    freeEntitlements,
    products
  };
};

const readBillingSettingsRow = async (options: AdminDatabaseOptions & {
  projectSlug: string;
}) => {
  return withAdminDb(options, async ({ db }) => {
    const rows = await db
      .select()
      .from(billingSettings)
      .where(eq(billingSettings.projectSlug, options.projectSlug))
      .limit(1);

    return rows[0] ?? null;
  });
};

const encryptSecret = (
  value: string,
  secret: string,
  projectSlug: string,
  key: string
) => {
  return encryptSecretValue(value, secret, encryptionContext(projectSlug, key));
};

const decryptSecret = (value: string, secret: string, projectSlug: string, key: string) => {
  if (!value) {
    return "";
  }

  return decryptSecretValue(value, secret, encryptionContext(projectSlug, key));
};

const encryptionContext = (projectSlug: string, key: string) => {
  return `billing:${projectSlug}:${key}`;
};

const normalizeBillingProducts = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((product) => ({
      slug: typeof product.slug === "string" ? product.slug : "",
      name: typeof product.name === "string" ? product.name : "",
      description: typeof product.description === "string" ? product.description : "",
      productId: typeof product.productId === "string" ? product.productId : "",
      type: normalizeProductType(product.type),
      active: typeof product.active === "boolean" ? product.active : false,
      entitlements: normalizeEntitlements(product.entitlements)
    }))
    .filter((product) => product.slug);
};

const normalizeEntitlements = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((entitlement) => ({
    key: typeof entitlement.key === "string" ? entitlement.key : "",
    grantType: normalizeGrantType(entitlement.grantType),
    amount:
      typeof entitlement.amount === "number" && Number.isFinite(entitlement.amount)
        ? entitlement.amount
        : null,
    resetPeriod: normalizeResetPeriod(entitlement.resetPeriod),
    priority:
      typeof entitlement.priority === "number" && Number.isFinite(entitlement.priority)
        ? entitlement.priority
        : 100
  }));
};

const normalizeProductType = (value: unknown) => {
  return isEnumValue(BillingProductType, value)
    ? value
    : BillingProductType.OneTime;
};

const normalizeGrantType = (value: unknown) => {
  return isEnumValue(EntitlementGrantType, value)
    ? value
    : EntitlementGrantType.Boolean;
};

const normalizeResetPeriod = (value: unknown) => {
  return isEnumValue(EntitlementResetPeriod, value)
    ? value
    : EntitlementResetPeriod.Never;
};
