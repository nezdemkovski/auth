import type { RegisteredProject } from "../../auth/registry";
import type { AdminApiOptions } from "./context";

export type AdminRouteError = {
  error: "unknown_project" | "system_project_locked";
  status: 404 | 409;
};

export type AdminProjectLookup =
  | {
      registered: RegisteredProject;
      error?: never;
      status?: never;
    }
  | AdminRouteError;

export const requireRegisteredProject = (options: AdminApiOptions, slug: string) => {
  const registered = options.registry.get(slug);
  if (!registered) {
    const result: AdminProjectLookup = {
      error: "unknown_project",
      status: 404
    };

    return result;
  }

  const result: AdminProjectLookup = { registered };

  return result;
};

export const requireMutableProject = (options: AdminApiOptions, slug: string) => {
  const result = requireRegisteredProject(options, slug);
  if (result.error) {
    return result;
  }
  if (result.registered.project.slug === options.adminProject.slug) {
    const locked: AdminProjectLookup = {
      error: "system_project_locked",
      status: 409
    };

    return locked;
  }

  return result;
};
