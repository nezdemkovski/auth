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

export function requireRegisteredProject(
  options: AdminApiOptions,
  slug: string
): AdminProjectLookup {
  const registered = options.registry.get(slug);
  if (!registered) {
    return {
      error: "unknown_project",
      status: 404
    };
  }

  return { registered };
}

export function requireMutableProject(
  options: AdminApiOptions,
  slug: string
): AdminProjectLookup {
  const result = requireRegisteredProject(options, slug);
  if (result.error) {
    return result;
  }
  if (result.registered.project.slug === options.adminProject.slug) {
    return {
      error: "system_project_locked",
      status: 409
    };
  }

  return result;
}
