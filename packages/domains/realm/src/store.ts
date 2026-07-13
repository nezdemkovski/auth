import {
  type AdminDatabaseOptions,
  withAdminDb
} from "@nezdemkovski/auth-platform-database";
import { and, asc, desc, eq, or, sql } from "drizzle-orm";

import {
  validateRealmSchema,
  validateRealmSlug,
  type Realm
} from "./model";
import { realmSettings } from "./tables";
import {
  normalizeRealmFeatures,
  validateRealmSettingsPatch,
  type RealmSettingsPatch
} from "./validator";

export type StoredRealmSettings = Omit<Realm, "socialProviders">;

export const ensureRealmSettingsTable = async (options: AdminDatabaseOptions) => {
  await withAdminDb(options, async ({ db }) => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS auth_project_settings (
        slug text PRIMARY KEY,
        name text NOT NULL,
        schema text NOT NULL,
        description text NOT NULL DEFAULT '',
        icon_url text NOT NULL DEFAULT '',
        app_url text NOT NULL DEFAULT '',
        trusted_origins jsonb NOT NULL DEFAULT '[]'::jsonb,
        features jsonb NOT NULL DEFAULT '{}'::jsonb,
        system boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      ALTER TABLE auth_project_settings
      ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true
    `);
    await db.execute(sql`
      ALTER TABLE auth_project_settings
      ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS auth_project_settings_schema_key
      ON auth_project_settings (schema)
    `);
  });
};

export const seedAdminRealmSettings = async (
  options: AdminDatabaseOptions & { realm: Realm }
) => {
  await withAdminDb(options, async ({ db }) => {
    await db
      .insert(realmSettings)
      .values({
        slug: options.realm.slug,
        name: options.realm.name,
        schema: options.realm.schema,
        description: options.realm.description,
        iconUrl: options.realm.iconUrl,
        appUrl: options.realm.appUrl,
        trustedOrigins: options.realm.trustedOrigins,
        features: options.realm.features,
        system: true,
        enabled: true
      })
      .onConflictDoUpdate({
        target: realmSettings.slug,
        set: {
          name: options.realm.name,
          schema: options.realm.schema,
          description: options.realm.description,
          iconUrl: options.realm.iconUrl,
          appUrl: options.realm.appUrl,
          trustedOrigins: options.realm.trustedOrigins,
          features: sql`COALESCE(NULLIF(${realmSettings.features}, '{}'::jsonb), EXCLUDED.features)`,
          system: true,
          enabled: true
        }
      });
  });
};

export const realmSettingsExists = async (
  options: AdminDatabaseOptions & {
    slug: string;
    schema: string;
  }
) => {
  validateRealmSlug(options.slug);
  validateRealmSchema(options.schema);

  return withAdminDb(options, async ({ db }) => {
    const rows = await db
      .select({ slug: realmSettings.slug })
      .from(realmSettings)
      .where(
        or(
          eq(realmSettings.slug, options.slug),
          eq(realmSettings.schema, options.schema)
        )
      )
      .limit(1);

    return rows.length > 0;
  });
};

export const createRealmSettings = async (
  options: AdminDatabaseOptions & { realm: Realm }
) => {
  validateRealmSettingsPatch(options.realm);

  return withAdminDb(options, async ({ db }) => {
    const created = await db
      .insert(realmSettings)
      .values({
        slug: options.realm.slug,
        name: options.realm.name,
        schema: options.realm.schema,
        description: options.realm.description,
        iconUrl: options.realm.iconUrl,
        appUrl: options.realm.appUrl,
        trustedOrigins: options.realm.trustedOrigins,
        features: options.realm.features,
        system: false,
        enabled: true
      })
      .returning();

    return rowToRealm(created[0]);
  });
};

export const dropRealmSchema = async (
  options: AdminDatabaseOptions & { schema: string }
) => {
  validateRealmSchema(options.schema);

  await withAdminDb(options, async ({ db }) => {
    await db.execute(
      sql`DROP SCHEMA IF EXISTS ${sql.identifier(options.schema)} CASCADE`
    );
  });
};

export const deleteRealmSettings = async (
  options: AdminDatabaseOptions & { slug: string }
) => {
  validateRealmSlug(options.slug);

  await withAdminDb(options, async ({ db }) => {
    await db
      .delete(realmSettings)
      .where(
        and(
          eq(realmSettings.slug, options.slug),
          eq(realmSettings.system, false)
        )
      );
  });
};

export const updateRealmSettings = async (
  options: AdminDatabaseOptions & {
    slug: string;
    patch: RealmSettingsPatch;
  }
) => {
  validateRealmSettingsPatch(options.patch);

  return withAdminDb(options, async ({ db }) => {
    const existing = await db
      .select({ slug: realmSettings.slug })
      .from(realmSettings)
      .where(eq(realmSettings.slug, options.slug))
      .limit(1);

    if (existing.length === 0) {
      return null;
    }

    const updated = await db
      .update(realmSettings)
      .set({
        name: options.patch.name,
        description: options.patch.description,
        iconUrl: options.patch.iconUrl,
        appUrl: options.patch.appUrl,
        trustedOrigins: options.patch.trustedOrigins,
        features: options.patch.features,
        updatedAt: sql`now()`
      })
      .where(eq(realmSettings.slug, options.slug))
      .returning();

    return rowToRealm(updated[0]);
  });
};

export const updateRealmIconUrl = async (
  options: AdminDatabaseOptions & {
    slug: string;
    iconUrl: string;
  }
) => {
  validateOptionalUrl(options.iconUrl, "iconUrl");

  return withAdminDb(options, async ({ db }) => {
    const updated = await db
      .update(realmSettings)
      .set({
        iconUrl: options.iconUrl,
        updatedAt: sql`now()`
      })
      .where(eq(realmSettings.slug, options.slug))
      .returning();

    return updated[0] ? rowToRealm(updated[0]) : null;
  });
};

export const readRealmSettings = async (options: AdminDatabaseOptions) => {
  return withAdminDb(options, async ({ db }) => {
    const rows = await db
      .select()
      .from(realmSettings)
      .where(eq(realmSettings.enabled, true))
      .orderBy(desc(realmSettings.system), asc(realmSettings.slug));

    return rows.map(rowToRealm);
  });
};

const validateOptionalUrl = (value: string, field: string) => {
  if (!value) {
    return;
  }

  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error();
    }
  } catch {
    throw new Error(`Invalid ${field}`);
  }
};

const rowToRealm = (row: typeof realmSettings.$inferSelect) => {
  return {
    slug: row.slug,
    name: row.name,
    schema: row.schema,
    description: row.description ?? "",
    iconUrl: row.iconUrl ?? "",
    appUrl: row.appUrl ?? "",
    trustedOrigins: normalizeTrustedOrigins(row.trustedOrigins),
    features: normalizeRealmFeatures(row.features)
  };
};

const normalizeTrustedOrigins = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
};
