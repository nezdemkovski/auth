import type { AuthProject } from "../../config/projects";
import type { ProjectUserRow } from "./store";

export function usersProjectResponse(project: AuthProject, adminProject: AuthProject) {
  return {
    slug: project.slug,
    name: project.name,
    schema: project.schema,
    description: project.description,
    iconUrl: project.iconUrl,
    appUrl: project.appUrl,
    trustedOrigins: project.trustedOrigins,
    system: project.slug === adminProject.slug
  };
}

export function projectUserResponse(user: ProjectUserRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    banned: user.banned ?? false,
    emailVerified: user.emailVerified,
    createdAt: toIsoString(user.createdAt),
    updatedAt: toIsoString(user.updatedAt),
    sessionCount: Number(user.sessionCount)
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
