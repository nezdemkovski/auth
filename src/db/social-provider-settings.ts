import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  type AuthProject,
  type ProjectSocialProviders
} from "../config/projects";
import {
  isSocialProviderId,
  SOCIAL_PROVIDER_IDS,
  type SocialProviderId
} from "../config/social-providers";

export type PublicSocialProviderSettings = {
  provider: SocialProviderId;
  enabled: boolean;
  clientId: string;
  configured: boolean;
  verifiedAt: string | null;
  callbackUrl: string;
};

export type SocialProviderPatch = {
  enabled: boolean;
  clientId: string;
  clientSecret?: string;
};

type SocialProviderRow = {
  provider: string;
  enabled: boolean;
  clientId: string;
  clientSecretCipher: string;
  verifiedAt: Date | string | null;
};

export async function ensureSocialProviderSettingsTable(options: {
  databaseUrl: string;
  adminProject: AuthProject;
}): Promise<void> {
  const pool = createAdminPool(options.databaseUrl, options.adminProject);
  const db = drizzle({ client: pool });

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS auth_social_provider_settings (
        project_slug text NOT NULL REFERENCES auth_project_settings(slug) ON DELETE CASCADE,
        provider text NOT NULL,
        enabled boolean NOT NULL DEFAULT false,
        client_id text NOT NULL DEFAULT '',
        client_secret_cipher text NOT NULL DEFAULT '',
        verified_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (project_slug, provider)
      )
    `);
  } finally {
    await pool.end();
  }
}

export async function loadSocialProviderSettings(options: {
  databaseUrl: string;
  adminProject: AuthProject;
  encryptionSecret: string;
}): Promise<Map<string, ProjectSocialProviders>> {
  await ensureSocialProviderSettingsTable(options);

  const pool = createAdminPool(options.databaseUrl, options.adminProject);
  const db = drizzle({ client: pool });

  try {
    const result = await db.execute<
      SocialProviderRow & { projectSlug: string }
    >(sql`
      SELECT project_slug AS "projectSlug",
             provider,
             enabled,
             client_id AS "clientId",
             client_secret_cipher AS "clientSecretCipher",
             verified_at AS "verifiedAt"
      FROM auth_social_provider_settings
    `);

    const byProject = new Map<string, ProjectSocialProviders>();
    for (const row of result.rows) {
      if (!isSocialProviderId(row.provider)) {
        continue;
      }

      const current = byProject.get(row.projectSlug) ?? cloneDefaultSocialProviders();
      current[row.provider] = {
        enabled: row.enabled,
        clientId: row.clientId,
        clientSecret: decryptSecret(row.clientSecretCipher, options.encryptionSecret),
        verifiedAt: normalizeDate(row.verifiedAt)
      };
      byProject.set(row.projectSlug, current);
    }

    return byProject;
  } finally {
    await pool.end();
  }
}

export async function readProjectSocialProviders(options: {
  databaseUrl: string;
  adminProject: AuthProject;
  project: AuthProject;
  publicBaseUrl: string;
}): Promise<PublicSocialProviderSettings[]> {
  await ensureSocialProviderSettingsTable(options);

  const pool = createAdminPool(options.databaseUrl, options.adminProject);
  const db = drizzle({ client: pool });

  try {
    const result = await db.execute<SocialProviderRow>(sql`
      SELECT provider,
             enabled,
             client_id AS "clientId",
             client_secret_cipher AS "clientSecretCipher",
             verified_at AS "verifiedAt"
      FROM auth_social_provider_settings
      WHERE project_slug = ${options.project.slug}
    `);
    const rows = new Map(result.rows.map((row) => [row.provider, row]));

    return SOCIAL_PROVIDER_IDS.map((provider) => {
      const row = rows.get(provider);
      const clientId = row?.clientId ?? "";
      return {
        provider,
        enabled: row?.enabled ?? false,
        clientId,
        configured: Boolean(clientId && row?.clientSecretCipher),
        verifiedAt: normalizeDate(row?.verifiedAt ?? null),
        callbackUrl: socialProviderCallbackUrl(options.publicBaseUrl, options.project, provider)
      };
    });
  } finally {
    await pool.end();
  }
}

export async function updateProjectSocialProvider(options: {
  databaseUrl: string;
  adminProject: AuthProject;
  project: AuthProject;
  provider: SocialProviderId;
  patch: SocialProviderPatch;
  encryptionSecret: string;
}): Promise<ProjectSocialProviders> {
  await ensureSocialProviderSettingsTable(options);

  const pool = createAdminPool(options.databaseUrl, options.adminProject);
  const db = drizzle({ client: pool });
  const clientId = options.patch.clientId.trim();
  const secretCipher =
    options.patch.clientSecret !== undefined
      ? encryptSecret(options.patch.clientSecret.trim(), options.encryptionSecret)
      : null;

  try {
    if (secretCipher === null) {
      await db.execute(sql`
        INSERT INTO auth_social_provider_settings (
          project_slug,
          provider,
          enabled,
          client_id,
          client_secret_cipher
        )
        VALUES (${options.project.slug}, ${options.provider}, ${options.patch.enabled}, ${clientId}, '')
        ON CONFLICT (project_slug, provider) DO UPDATE
        SET enabled = EXCLUDED.enabled,
            client_id = EXCLUDED.client_id,
            updated_at = now()
      `);
    } else {
      await db.execute(sql`
        INSERT INTO auth_social_provider_settings (
          project_slug,
          provider,
          enabled,
          client_id,
          client_secret_cipher,
          verified_at
        )
        VALUES (
          ${options.project.slug},
          ${options.provider},
          ${options.patch.enabled},
          ${clientId},
          ${secretCipher},
          NULL
        )
        ON CONFLICT (project_slug, provider) DO UPDATE
        SET enabled = EXCLUDED.enabled,
            client_id = EXCLUDED.client_id,
            client_secret_cipher = EXCLUDED.client_secret_cipher,
            verified_at = NULL,
            updated_at = now()
      `);
    }
  } finally {
    await pool.end();
  }

  return loadProjectSocialProviders({
    databaseUrl: options.databaseUrl,
    adminProject: options.adminProject,
    project: options.project,
    encryptionSecret: options.encryptionSecret
  });
}

export async function markSocialProviderVerified(options: {
  databaseUrl: string;
  adminProject: AuthProject;
  project: AuthProject;
  provider: SocialProviderId;
}): Promise<void> {
  await ensureSocialProviderSettingsTable(options);

  const pool = createAdminPool(options.databaseUrl, options.adminProject);
  const db = drizzle({ client: pool });

  try {
    await db.execute(sql`
      UPDATE auth_social_provider_settings
      SET verified_at = now(),
          updated_at = now()
      WHERE project_slug = ${options.project.slug}
        AND provider = ${options.provider}
    `);
  } finally {
    await pool.end();
  }
}

export async function loadProjectSocialProviders(options: {
  databaseUrl: string;
  adminProject: AuthProject;
  project: AuthProject;
  encryptionSecret: string;
}): Promise<ProjectSocialProviders> {
  const all = await loadSocialProviderSettings(options);
  return all.get(options.project.slug) ?? cloneDefaultSocialProviders();
}

export function socialProviderCallbackUrl(
  publicBaseUrl: string,
  project: AuthProject,
  provider: SocialProviderId
): string {
  return `${publicBaseUrl}/${project.slug}/api/auth/callback/${provider}`;
}

export function cloneDefaultSocialProviders(): ProjectSocialProviders {
  return Object.fromEntries(
    SOCIAL_PROVIDER_IDS.map((provider) => [
      provider,
      {
        ...DEFAULT_PROJECT_SOCIAL_PROVIDERS[provider]
      }
    ])
  ) as ProjectSocialProviders;
}

function encryptSecret(value: string, secret: string): string {
  if (!value) {
    return "";
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

function decryptSecret(value: string, secret: string): string {
  if (!value) {
    return "";
  }

  const [version, iv, tag, encrypted] = value.split(":");
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new Error("Invalid social provider secret cipher");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(secret),
    Buffer.from(iv, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function encryptionKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function normalizeDate(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function createAdminPool(databaseUrl: string, adminProject: AuthProject): Pool {
  return new Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${adminProject.schema},public`
  });
}
