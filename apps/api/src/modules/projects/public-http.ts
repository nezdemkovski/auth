import type { Hono } from "hono";

import type { AuthRegistry } from "../../auth/registry";

type PublicProjectsVariables = {
  registry: AuthRegistry;
};

export function registerPublicProjectRoutes(
  app: Hono<{ Variables: PublicProjectsVariables }>,
  options: {
    registry: AuthRegistry;
    adminProjectSlug: string;
  }
): void {
  app.get("/api/projects", (c) => {
    const publicProjects = options.registry
      .list()
      .filter((project) => project.slug !== options.adminProjectSlug);

    return c.json({
      projects: publicProjects.map((project) => ({
        slug: project.slug,
        name: project.name
      }))
    });
  });
}
