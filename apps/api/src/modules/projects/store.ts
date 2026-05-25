import { sql } from "drizzle-orm";

import {
  DEFAULT_PROJECT_FEATURES,
  ProjectAgentAuthMode,
  ProjectTwoFactorRequirement,
  normalizeProjectSlug,
  projectSchemaFromSlug,
  validateProjectSchema,
  validateProjectSlug,
  type AuthProject,
  type ProjectFeatures
} from "../../config/projects";
import { type AdminDatabaseOptions, withAdminDb } from "../../db/admin-pool";
import { cloneDefaultBilling, loadBillingSettings } from "../billing/store";
import {
  cloneDefaultStorage,
  loadStorageSettings
} from "../storage/settings-store";
import {
  ensureSocialProviderSettingsTable,
  cloneDefaultSocialProviders,
  loadSocialProviderSettings
} from "./social-provider-store";

export type ProjectSettingsPatch = {
  name: string;
  description: string;
  iconUrl: string;
  appUrl: string;
  trustedOrigins: string[];
  features: ProjectFeatures;
};

export type ProjectSettingsCreate = Omit<ProjectSettingsPatch, "features"> & {
  slug: string;
  features?: ProjectFeatures;
};

type ProjectSettingsRow = {
  slug: string;
  name: string;
  schema: string;
  description: string | null;
  iconUrl: string | null;
  appUrl: string | null;
  trustedOrigins: unknown;
  features: unknown;
  system: boolean;
};

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
    await db.execute(sql`
      INSERT INTO auth_project_settings (
        slug,
        name,
        schema,
        description,
        icon_url,
        app_url,
        trusted_origins,
        features,
        system,
        enabled
      )
      VALUES (
        ${project.slug},
        ${project.name},
        ${project.schema},
        ${project.description},
        ${project.iconUrl},
        ${project.appUrl},
        ${JSON.stringify(project.trustedOrigins)}::jsonb,
        ${JSON.stringify(project.features)}::jsonb,
        true,
        true
      )
      ON CONFLICT (slug) DO UPDATE
      SET name = EXCLUDED.name,
          schema = EXCLUDED.schema,
          description = EXCLUDED.description,
          icon_url = EXCLUDED.icon_url,
          app_url = EXCLUDED.app_url,
          trusted_origins = EXCLUDED.trusted_origins,
          features = COALESCE(NULLIF(auth_project_settings.features, '{}'::jsonb), EXCLUDED.features),
          system = true,
          enabled = true
    `);
  });
};

export const loadEffectiveProjects = async (options: AdminDatabaseOptions & {
  encryptionSecret: string;
  managedStorage: AuthProject["storage"];
}) => {
  await ensureProjectSettingsTable(options);
  await seedAdminProjectSettings(options);
  await ensureSocialProviderSettingsTable(options);

  const all = await readProjectSettings(options);
  const socialProviders = await loadSocialProviderSettings(options);
  const billingSettings = await loadBillingSettings(options);
  const storageSettings = await loadStorageSettings(options);
  const allWithSettings = all.map((project) => ({
    ...project,
    socialProviders:
      socialProviders.get(project.slug) ?? cloneDefaultSocialProviders(),
    billing: billingSettings.get(project.slug) ?? cloneDefaultBilling(),
    storage: storageSettings.get(project.slug) ?? cloneDefaultStorage(options.managedStorage)
  }));
  const bySlug = new Map(allWithSettings.map((project) => [project.slug, project]));
  const adminProject = bySlug.get(options.adminProject.slug) ?? options.adminProject;

  return {
    adminProject,
    projects: allWithSettings.filter((project) => project.slug !== adminProject.slug)
  };
};

export const projectSettingsExists = async (options: AdminDatabaseOptions & {
  slug: string;
  schema: string;
}) => {
  validateProjectSlug(options.slug);
  validateProjectSchema(options.schema);

  return withAdminDb(options, async ({ db }) => {
    const result = await db.execute<{ exists: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1
        FROM auth_project_settings
        WHERE slug = ${options.slug}
           OR schema = ${options.schema}
      ) AS "exists"
    `);
    return result.rows[0]?.exists ?? false;
  });
};

export const createProjectSettings = async (options: AdminDatabaseOptions & {
  input: ProjectSettingsCreate;
}) => {
  const project = createProjectFromInput(options.input);
  validateProjectSettingsPatch(project);

  return withAdminDb(options, async ({ db }) => {
    const created = await db.execute<ProjectSettingsRow>(sql`
      INSERT INTO auth_project_settings (
        slug,
        name,
        schema,
        description,
        icon_url,
        app_url,
        trusted_origins,
        features,
        system,
        enabled
      )
      VALUES (
        ${project.slug},
        ${project.name},
        ${project.schema},
        ${project.description},
        ${project.iconUrl},
        ${project.appUrl},
        ${JSON.stringify(project.trustedOrigins)}::jsonb,
        ${JSON.stringify(project.features)}::jsonb,
        false,
        true
      )
      RETURNING slug, name, schema, description, icon_url AS "iconUrl",
                app_url AS "appUrl", trusted_origins AS "trustedOrigins",
                features,
                system
    `);

    return rowToProject(created.rows[0]);
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
    await db.execute(sql`
      DELETE FROM auth_project_settings
      WHERE slug = ${options.slug}
        AND system = false
    `);
  });
};

export const updateProjectSettings = async (options: AdminDatabaseOptions & {
  slug: string;
  patch: ProjectSettingsPatch;
}) => {
  validateProjectSettingsPatch(options.patch);

  return withAdminDb(options, async ({ db }) => {
    const existing = await db.execute<ProjectSettingsRow>(sql`
      SELECT slug, name, schema, description, icon_url AS "iconUrl",
             app_url AS "appUrl", trusted_origins AS "trustedOrigins",
             features,
             system
      FROM auth_project_settings
      WHERE slug = ${options.slug}
      LIMIT 1
    `);

    if (existing.rows.length === 0) {
      return null;
    }

    const updated = await db.execute<ProjectSettingsRow>(sql`
      UPDATE auth_project_settings
      SET name = ${options.patch.name},
          description = ${options.patch.description},
          icon_url = ${options.patch.iconUrl},
          app_url = ${options.patch.appUrl},
          trusted_origins = ${JSON.stringify(options.patch.trustedOrigins)}::jsonb,
          features = ${JSON.stringify(options.patch.features)}::jsonb,
          updated_at = now()
      WHERE slug = ${options.slug}
      RETURNING slug, name, schema, description, icon_url AS "iconUrl",
                app_url AS "appUrl", trusted_origins AS "trustedOrigins",
                features,
                system
    `);

    return rowToProject(updated.rows[0]);
  });
};

export const updateProjectIconUrl = async (options: AdminDatabaseOptions & {
  slug: string;
  iconUrl: string;
}) => {
  validateOptionalUrl(options.iconUrl, "iconUrl");

  return withAdminDb(options, async ({ db }) => {
    const updated = await db.execute<ProjectSettingsRow>(sql`
      UPDATE auth_project_settings
      SET icon_url = ${options.iconUrl},
          updated_at = now()
      WHERE slug = ${options.slug}
      RETURNING slug, name, schema, description, icon_url AS "iconUrl",
                app_url AS "appUrl", trusted_origins AS "trustedOrigins",
                features,
                system
    `);

    return updated.rows[0] ? rowToProject(updated.rows[0]) : null;
  });
};

const readProjectSettings = async (options: AdminDatabaseOptions) => {
  return withAdminDb(options, async ({ db }) => {
    const rows = await db.execute<ProjectSettingsRow>(sql`
      SELECT slug, name, schema, description, icon_url AS "iconUrl",
             app_url AS "appUrl", trusted_origins AS "trustedOrigins",
             features,
             system
      FROM auth_project_settings
      WHERE enabled = true
      ORDER BY system DESC, slug ASC
    `);

    return rows.rows.map(rowToProject);
  });
};

export const validateProjectSettingsPatch = (patch: ProjectSettingsPatch) => {
  if (patch.name.trim().length === 0) {
    throw new Error("Project name is required");
  }

  validateOptionalUrl(patch.iconUrl, "iconUrl");
  validateOptionalUrl(patch.appUrl, "appUrl");

  const seen = new Set<string>();
  for (const origin of patch.trustedOrigins) {
    validateOrigin(origin);
    if (seen.has(origin)) {
      throw new Error(`Duplicate trusted origin: ${origin}`);
    }
    seen.add(origin);
  }
};

export const createProjectFromInput = (input: ProjectSettingsCreate) => {
  const slug = normalizeProjectSlug(input.slug);
  validateProjectSlug(slug);

  const project = {
    slug,
    name: input.name.trim(),
    schema: projectSchemaFromSlug(slug),
    description: input.description.trim(),
    iconUrl: input.iconUrl.trim(),
    appUrl: input.appUrl.trim(),
    trustedOrigins: input.trustedOrigins.map((origin) => origin.trim()).filter(Boolean),
    features: normalizeProjectFeatures(input.features),
    socialProviders: optionsDefaultSocialProviders(),
    billing: cloneDefaultBilling(),
    storage: cloneDefaultStorage()
  };

  validateProjectSchema(project.schema);
  return project;
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

const validateOrigin = (value: string) => {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== value) {
      throw new Error();
    }
  } catch {
    throw new Error(`Invalid trusted origin: ${value}`);
  }
};

const rowToProject = (row: ProjectSettingsRow) => {
  return {
    slug: row.slug,
    name: row.name,
    schema: row.schema,
    description: row.description ?? "",
    iconUrl: row.iconUrl ?? "",
    appUrl: row.appUrl ?? "",
    trustedOrigins: normalizeTrustedOrigins(row.trustedOrigins),
    features: normalizeProjectFeatures(row.features),
    socialProviders: optionsDefaultSocialProviders(),
    billing: cloneDefaultBilling(),
    storage: cloneDefaultStorage()
  };
};

export const normalizeProjectFeatures = (value: unknown) => {
  if (!isRecord(value)) {
    return cloneDefaultFeatures();
  }

  const passkey = isRecord(value.passkey) ? value.passkey : {};
  const twoFactor = isRecord(value.twoFactor) ? value.twoFactor : {};
  const agentAuth = isRecord(value.agentAuth) ? value.agentAuth : {};
  const oauthProvider = isRecord(value.oauthProvider) ? value.oauthProvider : {};

  const required = twoFactor.required;
  const mode = agentAuth.mode;

  return {
    passkey: {
      enabled: typeof passkey.enabled === "boolean" ? passkey.enabled : false
    },
    twoFactor: {
      enabled: typeof twoFactor.enabled === "boolean" ? twoFactor.enabled : false,
      required:
        required === ProjectTwoFactorRequirement.Admins ||
        required === ProjectTwoFactorRequirement.Everyone ||
        required === ProjectTwoFactorRequirement.Optional
          ? required
          : ProjectTwoFactorRequirement.Optional
    },
    agentAuth: {
      enabled: typeof agentAuth.enabled === "boolean" ? agentAuth.enabled : false,
      mode:
        mode === ProjectAgentAuthMode.ScopedWrite ||
        mode === ProjectAgentAuthMode.ReadOnly
          ? mode
          : ProjectAgentAuthMode.ReadOnly
    },
    oauthProvider: {
      enabled:
        typeof oauthProvider.enabled === "boolean" ? oauthProvider.enabled : false,
      dynamicClientRegistration:
        typeof oauthProvider.dynamicClientRegistration === "boolean"
          ? oauthProvider.dynamicClientRegistration
          : false
    }
  };
};

const cloneDefaultFeatures = () => {
  return {
    passkey: {
      ...DEFAULT_PROJECT_FEATURES.passkey
    },
    twoFactor: {
      ...DEFAULT_PROJECT_FEATURES.twoFactor
    },
    agentAuth: {
      ...DEFAULT_PROJECT_FEATURES.agentAuth
    },
    oauthProvider: {
      ...DEFAULT_PROJECT_FEATURES.oauthProvider
    }
  };
};

const optionsDefaultSocialProviders = () => {
  return cloneDefaultSocialProviders();
};

const normalizeTrustedOrigins = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
