import {
  decryptSecretValue,
  encryptSecretValue,
  type AdminDatabaseOptions,
  withAdminDb
} from "@nezdemkovski/auth-platform-database";
import { and, eq, sql } from "drizzle-orm";

import {
  cloneDefaultSocialProviders,
  type Realm,
  type RealmSocialProviders
} from "./model";
import { realmSocialProviderSettings } from "./social-provider-tables";
import {
  isSocialProviderConfigured,
  isSocialProviderId,
  SOCIAL_PROVIDER_IDS,
  type SocialProviderId
} from "./social-providers";

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

type RealmReference = Pick<Realm, "slug">;

export const ensureRealmSocialProviderSettingsTable = async (
  options: AdminDatabaseOptions
) => {
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

export const loadRealmSocialProviderSettings = async (
  options: AdminDatabaseOptions & { encryptionSecret: string }
) => {
  return withAdminDb(options, async ({ db }) => {
    const rows = await db.select().from(realmSocialProviderSettings);

    const byRealm = new Map<string, RealmSocialProviders>();
    for (const row of rows) {
      if (!isSocialProviderId(row.provider)) {
        continue;
      }

      const current = byRealm.get(row.projectSlug) ?? cloneDefaultSocialProviders();
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
      byRealm.set(row.projectSlug, current);
    }

    return byRealm;
  });
};

export const readRealmSocialProviders = async (
  options: AdminDatabaseOptions & { realm: RealmReference }
) => {
  return withAdminDb(options, async ({ db }) => {
    const result = await db
      .select()
      .from(realmSocialProviderSettings)
      .where(eq(realmSocialProviderSettings.projectSlug, options.realm.slug));
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

export const updateRealmSocialProvider = async (
  options: AdminDatabaseOptions & {
    realm: RealmReference;
    provider: SocialProviderId;
    patch: SocialProviderPatch;
    encryptionSecret: string;
  }
) => {
  const clientId = options.patch.clientId.trim();
  const secretCipher =
    options.patch.clientSecret !== undefined
      ? await encryptSocialProviderSecret(
          options.patch.clientSecret.trim(),
          options.encryptionSecret,
          options.realm.slug,
          options.provider
        )
      : null;

  await withAdminDb(options, async ({ db }) => {
    if (secretCipher === null) {
      await db
        .insert(realmSocialProviderSettings)
        .values({
          projectSlug: options.realm.slug,
          provider: options.provider,
          enabled: options.patch.enabled,
          clientId,
          clientSecretCipher: ""
        })
        .onConflictDoUpdate({
          target: [
            realmSocialProviderSettings.projectSlug,
            realmSocialProviderSettings.provider
          ],
          set: {
            enabled: options.patch.enabled,
            clientId,
            verifiedAt: sql`
              CASE
                WHEN EXCLUDED.enabled = true
                     AND (
                       ${realmSocialProviderSettings.enabled} = false
                       OR ${realmSocialProviderSettings.clientId} <> EXCLUDED.client_id
                     )
                THEN NULL
                ELSE ${realmSocialProviderSettings.verifiedAt}
              END
            `,
            updatedAt: sql`now()`
          }
        });
    } else {
      await db
        .insert(realmSocialProviderSettings)
        .values({
          projectSlug: options.realm.slug,
          provider: options.provider,
          enabled: options.patch.enabled,
          clientId,
          clientSecretCipher: secretCipher,
          verifiedAt: null
        })
        .onConflictDoUpdate({
          target: [
            realmSocialProviderSettings.projectSlug,
            realmSocialProviderSettings.provider
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

  return loadRealmSocialProviders({
    databaseUrl: options.databaseUrl,
    adminProject: options.adminProject,
    adminDb: options.adminDb,
    realm: options.realm,
    encryptionSecret: options.encryptionSecret
  });
};

export const markRealmSocialProviderVerified = async (
  options: AdminDatabaseOptions & {
    realm: RealmReference;
    provider: SocialProviderId;
  }
) => {
  await withAdminDb(options, async ({ db }) => {
    await db
      .update(realmSocialProviderSettings)
      .set({
        verifiedAt: sql`now()`,
        updatedAt: sql`now()`
      })
      .where(
        and(
          eq(realmSocialProviderSettings.projectSlug, options.realm.slug),
          eq(realmSocialProviderSettings.provider, options.provider)
        )
      );
  });
};

export const loadRealmSocialProviders = async (
  options: AdminDatabaseOptions & {
    realm: RealmReference;
    encryptionSecret: string;
  }
) => {
  const all = await loadRealmSocialProviderSettings(options);
  return all.get(options.realm.slug) ?? cloneDefaultSocialProviders();
};

export const encryptSocialProviderSecret = (
  value: string,
  secret: string,
  realmSlug: string,
  provider: SocialProviderId
) => {
  if (!value) {
    return "";
  }

  return encryptSecretValue(value, secret, encryptionContext(realmSlug, provider));
};

export const decryptSocialProviderSecret = (
  value: string,
  secret: string,
  realmSlug: string,
  provider: SocialProviderId
) => {
  if (!value) {
    return "";
  }

  return decryptSecretValue(value, secret, encryptionContext(realmSlug, provider));
};

const encryptionContext = (realmSlug: string, provider: string) => {
  return `social-provider:${realmSlug}:${provider}`;
};

const normalizeDate = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};
