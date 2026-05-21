export type AuthProject = {
  slug: string;
  name: string;
  schema: string;
  trustedOrigins: string[];
};

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

export function parseProjects(raw: string | undefined): AuthProject[] {
  if (!raw) {
    return [];
  }

  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("AUTH_PROJECTS must be a JSON array");
  }

  const projects = parsed.map(parseProject);
  const slugs = new Set<string>();
  const schemas = new Set<string>();

  for (const project of projects) {
    if (slugs.has(project.slug)) {
      throw new Error(`Duplicate project slug: ${project.slug}`);
    }

    if (schemas.has(project.schema)) {
      throw new Error(`Duplicate project schema: ${project.schema}`);
    }

    slugs.add(project.slug);
    schemas.add(project.schema);
  }

  return projects;
}

export function findProject(projects: AuthProject[], slug: string): AuthProject | null {
  return projects.find((project) => project.slug === slug) ?? null;
}

function parseProject(value: unknown): AuthProject {
  if (!isRecord(value)) {
    throw new Error("Each AUTH_PROJECTS item must be an object");
  }

  const slug = readString(value, "slug");
  const name = readString(value, "name");
  const schema = readString(value, "schema");
  const trustedOrigins = readStringArray(value, "trustedOrigins");

  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(`Invalid project slug: ${slug}`);
  }

  if (!IDENTIFIER_PATTERN.test(schema)) {
    throw new Error(`Invalid Postgres schema name: ${schema}`);
  }

  return {
    slug,
    name,
    schema,
    trustedOrigins
  };
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Project field ${key} must be a non-empty string`);
  }

  return value;
}

function readStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];

  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Project field ${key} must be a string array`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
