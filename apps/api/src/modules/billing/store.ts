import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  DEFAULT_PROJECT_BILLING,
  type AuthProject,
  type ProjectBillingSettings
} from "../../config/projects";
import { decryptSecretValue, encryptSecretValue } from "../../db/secret-crypto";
import { normalizeBillingProducts } from "./translator";
import type { BillingSettingsPatch } from "./validator";

export type PublicBillingSettings = Omit<
  ProjectBillingSettings,
  "accessToken" | "webhookSecret"
> & {
  accessTokenConfigured: boolean;
  webhookSecretConfigured: boolean;
  webhookUrl: string;
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

export async function ensureBillingSettingsTable(options: {
  databaseUrl: string;
  adminProject: AuthProject;
}): Promise<void> {
  const pool = createAdminPool(options.databaseUrl, options.adminProject);
  const db = drizzle({ client: pool });

  try {
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
  } finally {
    await pool.end();
  }
}

export async function loadBillingSettings(options: {
  databaseUrl: string;
  adminProject: AuthProject;
  encryptionSecret: string;
}): Promise<Map<string, ProjectBillingSettings>> {
  await ensureBillingSettingsTable(options);

  const pool = createAdminPool(options.databaseUrl, options.adminProject);
  const db = drizzle({ client: pool });

  try {
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
      byProject.set(row.projectSlug, rowToBilling(row, options.encryptionSecret));
    }
    return byProject;
  } finally {
    await pool.end();
  }
}

export async function loadProjectBillingSettings(options: {
  databaseUrl: string;
  adminProject: AuthProject;
  project: AuthProject;
  encryptionSecret: string;
}): Promise<ProjectBillingSettings> {
  const all = await loadBillingSettings(options);
  return all.get(options.project.slug) ?? cloneDefaultBilling();
}

export async function readPublicBillingSettings(options: {
  databaseUrl: string;
  adminProject: AuthProject;
  project: AuthProject;
  publicBaseUrl: string;
}): Promise<PublicBillingSettings> {
  await ensureBillingSettingsTable(options);

  const pool = createAdminPool(options.databaseUrl, options.adminProject);
  const db = drizzle({ client: pool });

  try {
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

    return rowToPublic(result.rows[0], options.project, options.publicBaseUrl);
  } finally {
    await pool.end();
  }
}

export async function updateBillingSettings(options: {
  databaseUrl: string;
  adminProject: AuthProject;
  project: AuthProject;
  encryptionSecret: string;
  patch: BillingSettingsPatch;
}): Promise<ProjectBillingSettings> {
  await ensureBillingSettingsTable(options);

  const current = await readBillingSettingsRow(options);
  const accessTokenCipher =
    options.patch.accessToken && options.patch.accessToken.trim()
      ? encryptSecret(
          options.patch.accessToken.trim(),
          options.encryptionSecret,
          options.project.slug,
          "access-token"
        )
      : current?.accessTokenCipher ?? "";
  const webhookSecretCipher =
    options.patch.webhookSecret && options.patch.webhookSecret.trim()
      ? encryptSecret(
          options.patch.webhookSecret.trim(),
          options.encryptionSecret,
          options.project.slug,
          "webhook-secret"
        )
      : current?.webhookSecretCipher ?? "";

  const pool = createAdminPool(options.databaseUrl, options.adminProject);
  const db = drizzle({ client: pool });

  try {
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
  } finally {
    await pool.end();
  }
}

export function cloneDefaultBilling(): ProjectBillingSettings {
  return {
    ...DEFAULT_PROJECT_BILLING,
    products: []
  };
}

export function billingWebhookUrl(publicBaseUrl: string, project: AuthProject): string {
  return `${publicBaseUrl}/api/${project.slug}/auth/polar/webhooks`;
}

function rowToBilling(row: BillingSettingsRow, encryptionSecret: string): ProjectBillingSettings {
  const provider = row.provider === "polar" ? "polar" : "none";
  const environment = row.environment === "production" ? "production" : "sandbox";
  return {
    provider,
    enabled: row.enabled,
    environment,
    organizationId: row.organizationId ?? "",
    accessToken: decryptSecret(
      row.accessTokenCipher,
      encryptionSecret,
      row.projectSlug,
      "access-token"
    ),
    webhookSecret: decryptSecret(
      row.webhookSecretCipher,
      encryptionSecret,
      row.projectSlug,
      "webhook-secret"
    ),
    products: normalizeBillingProducts(row.products)
  };
}

function rowToPublic(
  row: BillingSettingsRow | undefined,
  project: AuthProject,
  publicBaseUrl: string
): PublicBillingSettings {
  const products = normalizeBillingProducts(row?.products ?? []);
  const provider = row?.provider === "polar" ? "polar" : "none";
  const environment = row?.environment === "production" ? "production" : "sandbox";
  return {
    provider,
    enabled: row?.enabled ?? false,
    environment,
    organizationId: row?.organizationId ?? "",
    accessTokenConfigured: Boolean(row?.accessTokenCipher),
    webhookSecretConfigured: Boolean(row?.webhookSecretCipher),
    products,
    webhookUrl: billingWebhookUrl(publicBaseUrl, project)
  };
}

async function readBillingSettingsRow(options: {
  databaseUrl: string;
  adminProject: AuthProject;
  project: AuthProject;
}): Promise<BillingSettingsRow | null> {
  const pool = createAdminPool(options.databaseUrl, options.adminProject);
  const db = drizzle({ client: pool });

  try {
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
  } finally {
    await pool.end();
  }
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
  return `billing:${projectSlug}:${key}`;
}

function createAdminPool(databaseUrl: string, adminProject: AuthProject): Pool {
  return new Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${adminProject.schema},public`
  });
}
