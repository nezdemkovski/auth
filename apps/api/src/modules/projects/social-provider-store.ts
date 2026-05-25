import { sql } from "drizzle-orm";

import {
  DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  type AuthProject,
  type ProjectSocialProviders
} from "../../config/projects";
import {
  isSocialProviderId,
  SOCIAL_PROVIDER_IDS,
  type SocialProviderId
} from "../../config/social-providers";
import { type AdminDatabaseOptions, withAdminDb } from "../../db/admin-pool";
import { decryptSecretValue, encryptSecretValue } from "../../db/secret-crypto";

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

export const ensureSocialProviderSettingsTable = async (options: AdminDatabaseOptions) => {
  await withAdminDb(options, async ({ db }) => {
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
  });
};

export const loadSocialProviderSettings = async (options: AdminDatabaseOptions & {
  encryptionSecret: string;
}) => {
  await ensureSocialProviderSettingsTable(options);

  return withAdminDb(options, async ({ db }) => {
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
        clientSecret: decryptSocialProviderSecret(
          row.clientSecretCipher,
          options.encryptionSecret,
          row.projectSlug,
          row.provider
        ),
        verifiedAt: normalizeDate(row.verifiedAt)
      };
      byProject.set(row.projectSlug, current);
    }

    return byProject;
  });
};

export const readProjectSocialProviders = async (options: AdminDatabaseOptions & {
  project: AuthProject;
  publicBaseUrl: string;
}) => {
  await ensureSocialProviderSettingsTable(options);

  return withAdminDb(options, async ({ db }) => {
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
  });
};

export const updateProjectSocialProvider = async (options: AdminDatabaseOptions & {
  project: AuthProject;
  provider: SocialProviderId;
  patch: SocialProviderPatch;
  encryptionSecret: string;
}) => {
  await ensureSocialProviderSettingsTable(options);

  const clientId = options.patch.clientId.trim();
  const secretCipher =
    options.patch.clientSecret !== undefined
      ? encryptSocialProviderSecret(
          options.patch.clientSecret.trim(),
          options.encryptionSecret,
          options.project.slug,
          options.provider
        )
      : null;

  await withAdminDb(options, async ({ db }) => {
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
  });

  return loadProjectSocialProviders({
    databaseUrl: options.databaseUrl,
    adminProject: options.adminProject,
    adminDb: options.adminDb,
    project: options.project,
    encryptionSecret: options.encryptionSecret
  });
};

export const markSocialProviderVerified = async (options: AdminDatabaseOptions & {
  project: AuthProject;
  provider: SocialProviderId;
}) => {
  await ensureSocialProviderSettingsTable(options);

  await withAdminDb(options, async ({ db }) => {
    await db.execute(sql`
      UPDATE auth_social_provider_settings
      SET verified_at = now(),
          updated_at = now()
      WHERE project_slug = ${options.project.slug}
        AND provider = ${options.provider}
    `);
  });
};

export const loadProjectSocialProviders = async (options: AdminDatabaseOptions & {
  project: AuthProject;
  encryptionSecret: string;
}) => {
  const all = await loadSocialProviderSettings(options);
  return all.get(options.project.slug) ?? cloneDefaultSocialProviders();
};

export const socialProviderCallbackUrl = (publicBaseUrl: string, project: AuthProject, provider: SocialProviderId) => {
  return `${publicBaseUrl}/api/${project.slug}/auth/callback/${provider}`;
};

export const cloneDefaultSocialProviders = () => {
  return structuredClone(DEFAULT_PROJECT_SOCIAL_PROVIDERS);
};

export const encryptSocialProviderSecret = (value: string, secret: string, projectSlug: string, provider: SocialProviderId) => {
  if (!value) {
    return "";
  }

  return encryptSecretValue(value, secret, encryptionContext(projectSlug, provider));
};

export const decryptSocialProviderSecret = (value: string, secret: string, projectSlug: string, provider: SocialProviderId) => {
  if (!value) {
    return "";
  }

  return decryptSecretValue(value, secret, encryptionContext(projectSlug, provider));
};

const encryptionContext = (projectSlug: string, provider: string) => {
  return `social-provider:${projectSlug}:${provider}`;
};

const normalizeDate = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};
