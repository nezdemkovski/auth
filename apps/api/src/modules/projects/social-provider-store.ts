import { and, eq, sql } from "drizzle-orm";

import {
  DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  type AuthProject,
  type ProjectSocialProviders
} from "../../config/projects";
import {
  isSocialProviderConfigured,
  isSocialProviderId,
  SOCIAL_PROVIDER_IDS,
  type SocialProviderId
} from "../../config/social-providers";
import { type AdminDatabaseOptions, withAdminDb } from "../../db/admin-pool";
import { decryptSecretValue, encryptSecretValue } from "../../db/secret-crypto";
import { socialProviderSettings } from "./social-provider-tables";

export type SocialProviderSummary = {
  provider: SocialProviderId;
  enabled: boolean;
  clientId: string;
  configured: boolean;
  verifiedAt: string | null;
};

export type SocialProviderPatch = {
  enabled: boolean;
  clientId: string;
  clientSecret?: string;
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
  return withAdminDb(options, async ({ db }) => {
    const rows = await db.select().from(socialProviderSettings);

    const byProject = new Map<string, ProjectSocialProviders>();
    for (const row of rows) {
      if (!isSocialProviderId(row.provider)) {
        continue;
      }

      const current = byProject.get(row.projectSlug) ?? cloneDefaultSocialProviders();
      current[row.provider] = {
        enabled: row.enabled,
        clientId: row.clientId,
        clientSecret: await decryptSocialProviderSecret(
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
}) => {
  return withAdminDb(options, async ({ db }) => {
    const result = await db
      .select()
      .from(socialProviderSettings)
      .where(eq(socialProviderSettings.projectSlug, options.project.slug));
    const rows = new Map(result.map((row) => [row.provider, row]));

    return SOCIAL_PROVIDER_IDS.map((provider) => {
      const row = rows.get(provider);
      const clientId = row?.clientId ?? "";
      return {
        provider,
        enabled: row?.enabled ?? false,
        clientId,
        configured: isSocialProviderConfigured(provider, {
          clientId,
          clientSecret: row?.clientSecretCipher ?? ""
        }),
        verifiedAt: normalizeDate(row?.verifiedAt ?? null)
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
  const clientId = options.patch.clientId.trim();
  const secretCipher =
    options.patch.clientSecret !== undefined
      ? await encryptSocialProviderSecret(
          options.patch.clientSecret.trim(),
          options.encryptionSecret,
          options.project.slug,
          options.provider
        )
      : null;

  await withAdminDb(options, async ({ db }) => {
    if (secretCipher === null) {
      await db
        .insert(socialProviderSettings)
        .values({
          projectSlug: options.project.slug,
          provider: options.provider,
          enabled: options.patch.enabled,
          clientId,
          clientSecretCipher: ""
        })
        .onConflictDoUpdate({
          target: [
            socialProviderSettings.projectSlug,
            socialProviderSettings.provider
          ],
          set: {
            enabled: options.patch.enabled,
            clientId,
            verifiedAt: sql`
              CASE
                WHEN EXCLUDED.enabled = true
                     AND (
                       ${socialProviderSettings.enabled} = false
                       OR ${socialProviderSettings.clientId} <> EXCLUDED.client_id
                     )
                THEN NULL
                ELSE ${socialProviderSettings.verifiedAt}
              END
            `,
            updatedAt: sql`now()`
          }
        });
    } else {
      await db
        .insert(socialProviderSettings)
        .values({
          projectSlug: options.project.slug,
          provider: options.provider,
          enabled: options.patch.enabled,
          clientId,
          clientSecretCipher: secretCipher,
          verifiedAt: null
        })
        .onConflictDoUpdate({
          target: [
            socialProviderSettings.projectSlug,
            socialProviderSettings.provider
          ],
          set: {
            enabled: options.patch.enabled,
            clientId,
            clientSecretCipher: secretCipher,
            verifiedAt: null,
            updatedAt: sql`now()`
          }
        });
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
  await withAdminDb(options, async ({ db }) => {
    await db
      .update(socialProviderSettings)
      .set({
        verifiedAt: sql`now()`,
        updatedAt: sql`now()`
      })
      .where(
        and(
          eq(socialProviderSettings.projectSlug, options.project.slug),
          eq(socialProviderSettings.provider, options.provider)
        )
      );
  });
};

export const loadProjectSocialProviders = async (options: AdminDatabaseOptions & {
  project: AuthProject;
  encryptionSecret: string;
}) => {
  const all = await loadSocialProviderSettings(options);
  return all.get(options.project.slug) ?? cloneDefaultSocialProviders();
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
