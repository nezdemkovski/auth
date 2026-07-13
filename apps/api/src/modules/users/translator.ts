import type { AuthProject } from "../../config/projects";

export const usersProjectResponse = (project: AuthProject, adminProject: AuthProject) => {
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
};
