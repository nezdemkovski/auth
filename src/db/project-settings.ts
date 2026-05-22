import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import type { AuthProject } from "../config/projects";

export type ProjectSettingsPatch = {
  name: string;
  description: string;
  iconUrl: string;
  appUrl: string;
  trustedOrigins: string[];
};

type ProjectSettingsRow = {
  slug: string;
  name: string;
  schema: string;
  description: string | null;
  iconUrl: string | null;
  appUrl: string | null;
  trustedOrigins: unknown;
};

export async function ensureProjectSettingsTable(
  databaseUrl: string,
  adminProject: AuthProject
): Promise<void> {
  const pool = createAdminPool(databaseUrl, adminProject);
  const db = drizzle({ client: pool });

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS auth_project_settings (
        slug text PRIMARY KEY,
        name text NOT NULL,
        schema text NOT NULL,
        description text NOT NULL DEFAULT '',
        icon_url text NOT NULL DEFAULT '',
        app_url text NOT NULL DEFAULT '',
        trusted_origins jsonb NOT NULL DEFAULT '[]'::jsonb,
        system boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  } finally {
    await pool.end();
  }
}

export async function seedProjectSettings(options: {
  databaseUrl: string;
  adminProject: AuthProject;
  projects: AuthProject[];
}): Promise<void> {
  const pool = createAdminPool(options.databaseUrl, options.adminProject);
  const db = drizzle({ client: pool });

  try {
    for (const project of [options.adminProject, ...options.projects]) {
      await db.execute(sql`
        INSERT INTO auth_project_settings (
          slug,
          name,
          schema,
          description,
          icon_url,
          app_url,
          trusted_origins,
          system
        )
        VALUES (
          ${project.slug},
          ${project.name},
          ${project.schema},
          ${project.description},
          ${project.iconUrl},
          ${project.appUrl},
          ${JSON.stringify(project.trustedOrigins)}::jsonb,
          ${project.slug === options.adminProject.slug}
        )
        ON CONFLICT (slug) DO UPDATE
        SET schema = EXCLUDED.schema,
            system = EXCLUDED.system
      `);
    }
  } finally {
    await pool.end();
  }
}

export async function loadEffectiveProjects(options: {
  databaseUrl: string;
  adminProject: AuthProject;
  projects: AuthProject[];
}): Promise<{ adminProject: AuthProject; projects: AuthProject[] }> {
  await ensureProjectSettingsTable(options.databaseUrl, options.adminProject);
  await seedProjectSettings(options);

  const all = await readProjectSettings(options.databaseUrl, options.adminProject);
  const bySlug = new Map(all.map((project) => [project.slug, project]));
  const adminProject = bySlug.get(options.adminProject.slug) ?? options.adminProject;

  return {
    adminProject,
    projects: options.projects.map((project) => bySlug.get(project.slug) ?? project)
  };
}

export async function updateProjectSettings(options: {
  databaseUrl: string;
  adminProject: AuthProject;
  slug: string;
  patch: ProjectSettingsPatch;
}): Promise<AuthProject | null> {
  validateProjectSettingsPatch(options.patch);

  const pool = createAdminPool(options.databaseUrl, options.adminProject);
  const db = drizzle({ client: pool });

  try {
    const existing = await db.execute<ProjectSettingsRow>(sql`
      SELECT slug, name, schema, description, icon_url AS "iconUrl",
             app_url AS "appUrl", trusted_origins AS "trustedOrigins"
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
          updated_at = now()
      WHERE slug = ${options.slug}
      RETURNING slug, name, schema, description, icon_url AS "iconUrl",
                app_url AS "appUrl", trusted_origins AS "trustedOrigins"
    `);

    return rowToProject(updated.rows[0]);
  } finally {
    await pool.end();
  }
}

async function readProjectSettings(
  databaseUrl: string,
  adminProject: AuthProject
): Promise<AuthProject[]> {
  const pool = createAdminPool(databaseUrl, adminProject);
  const db = drizzle({ client: pool });

  try {
    const rows = await db.execute<ProjectSettingsRow>(sql`
      SELECT slug, name, schema, description, icon_url AS "iconUrl",
             app_url AS "appUrl", trusted_origins AS "trustedOrigins"
      FROM auth_project_settings
      ORDER BY system DESC, slug ASC
    `);

    return rows.rows.map(rowToProject);
  } finally {
    await pool.end();
  }
}

export function validateProjectSettingsPatch(patch: ProjectSettingsPatch): void {
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
}

function validateOptionalUrl(value: string, field: string): void {
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
}

function validateOrigin(value: string): void {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== value) {
      throw new Error();
    }
  } catch {
    throw new Error(`Invalid trusted origin: ${value}`);
  }
}

function rowToProject(row: ProjectSettingsRow): AuthProject {
  return {
    slug: row.slug,
    name: row.name,
    schema: row.schema,
    description: row.description ?? "",
    iconUrl: row.iconUrl ?? "",
    appUrl: row.appUrl ?? "",
    trustedOrigins: normalizeTrustedOrigins(row.trustedOrigins)
  };
}

function normalizeTrustedOrigins(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function createAdminPool(databaseUrl: string, adminProject: AuthProject): Pool {
  return new Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${adminProject.schema},public`
  });
}
