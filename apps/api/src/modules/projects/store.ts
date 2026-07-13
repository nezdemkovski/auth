import { and, asc, desc, eq, or, sql } from "drizzle-orm";

import {
  validateProjectSchema,
  validateProjectSlug,
  type AuthProject
} from "../../config/projects";
import { type AdminDatabaseOptions, withAdminDb } from "../../db/admin-pool";
import {
  normalizeProjectFeatures,
  validateProjectSettingsPatch,
  type ProjectSettingsPatch
} from "./validator";
import { projectSettings } from "./tables";

export type StoredProjectSettings = Omit<
  AuthProject,
  "socialProviders" | "billing" | "storage"
>;

export const ensureProjectSettingsTable = async (options: AdminDatabaseOptions) => {
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

export const seedAdminProjectSettings = async (options: AdminDatabaseOptions) => {
  await withAdminDb(options, async ({ db }) => {
    const project = options.adminProject;
    await db
      .insert(projectSettings)
      .values({
        slug: project.slug,
        name: project.name,
        schema: project.schema,
        description: project.description,
        iconUrl: project.iconUrl,
        appUrl: project.appUrl,
        trustedOrigins: project.trustedOrigins,
        features: project.features,
        system: true,
        enabled: true
      })
      .onConflictDoUpdate({
        target: projectSettings.slug,
        set: {
          name: project.name,
          schema: project.schema,
          description: project.description,
          iconUrl: project.iconUrl,
          appUrl: project.appUrl,
          trustedOrigins: project.trustedOrigins,
          features: sql`COALESCE(NULLIF(${projectSettings.features}, '{}'::jsonb), EXCLUDED.features)`,
          system: true,
          enabled: true
        }
      });
  });
};

export const projectSettingsExists = async (options: AdminDatabaseOptions & {
  slug: string;
  schema: string;
}) => {
  validateProjectSlug(options.slug);
  validateProjectSchema(options.schema);

  return withAdminDb(options, async ({ db }) => {
    const rows = await db
      .select({ slug: projectSettings.slug })
      .from(projectSettings)
      .where(
        or(
          eq(projectSettings.slug, options.slug),
          eq(projectSettings.schema, options.schema)
        )
      )
      .limit(1);

    return rows.length > 0;
  });
};

export const createProjectSettings = async (options: AdminDatabaseOptions & {
  project: AuthProject;
}) => {
  validateProjectSettingsPatch(options.project);

  return withAdminDb(options, async ({ db }) => {
    const created = await db
      .insert(projectSettings)
      .values({
        slug: options.project.slug,
        name: options.project.name,
        schema: options.project.schema,
        description: options.project.description,
        iconUrl: options.project.iconUrl,
        appUrl: options.project.appUrl,
        trustedOrigins: options.project.trustedOrigins,
        features: options.project.features,
        system: false,
        enabled: true
      })
      .returning();

    return rowToProject(created[0]);
  });
};

export const dropProjectSchema = async (options: AdminDatabaseOptions & {
  schema: string;
}) => {
  validateProjectSchema(options.schema);

  await withAdminDb(options, async ({ db }) => {
    await db.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier(options.schema)} CASCADE`);
  });
};

export const deleteProjectSettings = async (options: AdminDatabaseOptions & {
  slug: string;
}) => {
  validateProjectSlug(options.slug);

  await withAdminDb(options, async ({ db }) => {
    await db
      .delete(projectSettings)
      .where(
        and(
          eq(projectSettings.slug, options.slug),
          eq(projectSettings.system, false)
        )
      );
  });
};

export const updateProjectSettings = async (options: AdminDatabaseOptions & {
  slug: string;
  patch: ProjectSettingsPatch;
}) => {
  validateProjectSettingsPatch(options.patch);

  return withAdminDb(options, async ({ db }) => {
    const existing = await db
      .select({ slug: projectSettings.slug })
      .from(projectSettings)
      .where(eq(projectSettings.slug, options.slug))
      .limit(1);

    if (existing.length === 0) {
      return null;
    }

    const updated = await db
      .update(projectSettings)
      .set({
        name: options.patch.name,
        description: options.patch.description,
        iconUrl: options.patch.iconUrl,
        appUrl: options.patch.appUrl,
        trustedOrigins: options.patch.trustedOrigins,
        features: options.patch.features,
        updatedAt: sql`now()`
      })
      .where(eq(projectSettings.slug, options.slug))
      .returning();

    return rowToProject(updated[0]);
  });
};

export const updateProjectIconUrl = async (options: AdminDatabaseOptions & {
  slug: string;
  iconUrl: string;
}) => {
  validateOptionalUrl(options.iconUrl, "iconUrl");

  return withAdminDb(options, async ({ db }) => {
    const updated = await db
      .update(projectSettings)
      .set({
        iconUrl: options.iconUrl,
        updatedAt: sql`now()`
      })
      .where(eq(projectSettings.slug, options.slug))
      .returning();

    return updated[0] ? rowToProject(updated[0]) : null;
  });
};

export const readProjectSettings = async (options: AdminDatabaseOptions) => {
  return withAdminDb(options, async ({ db }) => {
    const rows = await db
      .select()
      .from(projectSettings)
      .where(eq(projectSettings.enabled, true))
      .orderBy(desc(projectSettings.system), asc(projectSettings.slug));

    return rows.map(rowToProject);
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

const rowToProject = (row: typeof projectSettings.$inferSelect) => {
  return {
    slug: row.slug,
    name: row.name,
    schema: row.schema,
    description: row.description ?? "",
    iconUrl: row.iconUrl ?? "",
    appUrl: row.appUrl ?? "",
    trustedOrigins: normalizeTrustedOrigins(row.trustedOrigins),
    features: normalizeProjectFeatures(row.features)
  };
};

const normalizeTrustedOrigins = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
};
