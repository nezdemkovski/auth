export type AuthProject = {
  slug: string;
  name: string;
  schema: string;
  description: string;
  iconUrl: string;
  appUrl: string;
  trustedOrigins: string[];
};

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

export const ADMIN_PROJECT: AuthProject = {
  slug: "admin",
  name: "Auth Admin",
  schema: "auth_admin",
  description: "System admin realm for managing auth projects.",
  iconUrl: "",
  appUrl: "",
  trustedOrigins: []
};

export function findProject(projects: AuthProject[], slug: string): AuthProject | null {
  return projects.find((project) => project.slug === slug) ?? null;
}

export function normalizeProjectSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function projectSchemaFromSlug(slug: string): string {
  return `${slug.replaceAll("-", "_")}_auth`;
}

export function validateProjectSlug(slug: string): void {
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(`Invalid project slug: ${slug}`);
  }
}

export function validateProjectSchema(schema: string): void {
  if (!IDENTIFIER_PATTERN.test(schema)) {
    throw new Error(`Invalid Postgres schema name: ${schema}`);
  }
}
