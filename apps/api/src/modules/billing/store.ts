import { sql } from "drizzle-orm";

import {
  BillingEnvironment,
  BillingProductType,
  BillingProvider,
  DEFAULT_PROJECT_BILLING,
  EntitlementGrantType,
  EntitlementResetPeriod,
  type AuthProject,
  type ProjectBillingSettings
} from "../../config/projects";
import { type AdminDatabaseOptions, withAdminDb } from "../../db/admin-pool";
import { decryptSecretValue, encryptSecretValue } from "../../db/secret-crypto";
import { isEnumValue } from "../../runtime/enums";
import { isRecord } from "../../runtime/type-guards";
import type { BillingSettingsPatch } from "./validator";

export type BillingSettingsState = Omit<
  ProjectBillingSettings,
  "accessToken" | "webhookSecret"
> & {
  accessTokenConfigured: boolean;
  webhookSecretConfigured: boolean;
};

type BillingSettingsRow = {
  projectSlug: string;
  provider: string;
  enabled: boolean;
  environment: string;
  organizationId: string;
  accessTokenCipher: string;
  webhookSecretCipher: string;
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
        products jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      ALTER TABLE auth_billing_settings
      ADD COLUMN IF NOT EXISTS organization_id text NOT NULL DEFAULT ''
    `);
  });
};

export const loadBillingSettings = async (options: AdminDatabaseOptions & {
  encryptionSecret: string;
}) => {
  return withAdminDb(options, async ({ db }) => {
    const result = await db.execute<BillingSettingsRow>(sql`
      SELECT project_slug AS "projectSlug",
             provider,
             enabled,
             environment,
             organization_id AS "organizationId",
             access_token_cipher AS "accessTokenCipher",
             webhook_secret_cipher AS "webhookSecretCipher",
             products
      FROM auth_billing_settings
    `);

    const byProject = new Map<string, ProjectBillingSettings>();
    for (const row of result.rows) {
      byProject.set(
        row.projectSlug,
        await rowToBilling(row, options.encryptionSecret)
      );
    }
    return byProject;
  });
};

export const loadProjectBillingSettings = async (options: AdminDatabaseOptions & {
  project: AuthProject;
  encryptionSecret: string;
}) => {
  const all = await loadBillingSettings(options);
  return all.get(options.project.slug) ?? cloneDefaultBilling();
};

export const readBillingSettingsState = async (options: AdminDatabaseOptions & {
  project: AuthProject;
}) => {
  return withAdminDb(options, async ({ db }) => {
    const result = await db.execute<BillingSettingsRow>(sql`
      SELECT project_slug AS "projectSlug",
             provider,
             enabled,
             environment,
             organization_id AS "organizationId",
             access_token_cipher AS "accessTokenCipher",
             webhook_secret_cipher AS "webhookSecretCipher",
             products
      FROM auth_billing_settings
      WHERE project_slug = ${options.project.slug}
      LIMIT 1
    `);

    return rowToState(result.rows[0]);
  });
};

export const updateBillingSettings = async (options: AdminDatabaseOptions & {
  project: AuthProject;
  encryptionSecret: string;
  patch: BillingSettingsPatch;
}) => {
  const current = await readBillingSettingsRow(options);
  const accessTokenCipher =
    options.patch.accessToken && options.patch.accessToken.trim()
      ? await encryptSecret(
          options.patch.accessToken.trim(),
          options.encryptionSecret,
          options.project.slug,
          "access-token"
        )
      : current?.accessTokenCipher ?? "";
  const webhookSecretCipher =
    options.patch.webhookSecret && options.patch.webhookSecret.trim()
      ? await encryptSecret(
          options.patch.webhookSecret.trim(),
          options.encryptionSecret,
          options.project.slug,
          "webhook-secret"
        )
      : current?.webhookSecretCipher ?? "";

  return withAdminDb(options, async ({ db }) => {
    const result = await db.execute<BillingSettingsRow>(sql`
      INSERT INTO auth_billing_settings (
        project_slug,
        provider,
        enabled,
        environment,
        organization_id,
        access_token_cipher,
        webhook_secret_cipher,
        products
      )
      VALUES (
        ${options.project.slug},
        ${options.patch.provider},
        ${options.patch.enabled},
        ${options.patch.environment},
        ${options.patch.organizationId?.trim() ?? ""},
        ${accessTokenCipher},
        ${webhookSecretCipher},
        ${JSON.stringify(options.patch.products)}::jsonb
      )
      ON CONFLICT (project_slug) DO UPDATE
      SET provider = EXCLUDED.provider,
          enabled = EXCLUDED.enabled,
          environment = EXCLUDED.environment,
          organization_id = EXCLUDED.organization_id,
          access_token_cipher = EXCLUDED.access_token_cipher,
          webhook_secret_cipher = EXCLUDED.webhook_secret_cipher,
          products = EXCLUDED.products,
          updated_at = now()
      RETURNING project_slug AS "projectSlug",
                provider,
                enabled,
                environment,
                organization_id AS "organizationId",
                access_token_cipher AS "accessTokenCipher",
                webhook_secret_cipher AS "webhookSecretCipher",
                products
    `);

    return rowToBilling(result.rows[0], options.encryptionSecret);
  });
};

export const cloneDefaultBilling = () => {
  return {
    ...DEFAULT_PROJECT_BILLING,
    products: []
  };
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
    products: normalizeBillingProducts(row.products)
  };
};

const rowToState = (row: BillingSettingsRow | undefined) => {
  const products = normalizeBillingProducts(row?.products ?? []);
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
    products
  };
};

const readBillingSettingsRow = async (options: AdminDatabaseOptions & {
  project: AuthProject;
}) => {
  return withAdminDb(options, async ({ db }) => {
    const result = await db.execute<BillingSettingsRow>(sql`
      SELECT project_slug AS "projectSlug",
             provider,
             enabled,
             environment,
             organization_id AS "organizationId",
             access_token_cipher AS "accessTokenCipher",
             webhook_secret_cipher AS "webhookSecretCipher",
             products
      FROM auth_billing_settings
      WHERE project_slug = ${options.project.slug}
      LIMIT 1
    `);

    return result.rows[0] ?? null;
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
