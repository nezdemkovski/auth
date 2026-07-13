import type { RegisteredProject } from "../../auth/registry";
import type { AuthProject } from "../../config/projects";
import { ErrorCode } from "../../runtime/error-codes";
import type { AdminRegistryOptions } from "./session";

export type AdminProjectLookupOptions = AdminRegistryOptions & {
  adminProject: Pick<AuthProject, "slug">;
};

export type AdminRouteError = {
  error: ErrorCode.UnknownProject | ErrorCode.SystemProjectLocked;
  status: 404 | 409;
};

export type AdminProjectLookup =
  | {
      registered: RegisteredProject;
      error?: never;
      status?: never;
    }
  | AdminRouteError;

export const requireRegisteredProject = (
  options: AdminRegistryOptions,
  slug: string
) => {
  const registered = options.registry.get(slug);
  if (!registered) {
    const result: AdminProjectLookup = {
      error: ErrorCode.UnknownProject,
      status: 404
    };

    return result;
  }

  const result: AdminProjectLookup = { registered };

  return result;
};

export const requireMutableProject = (
  options: AdminProjectLookupOptions,
  slug: string
) => {
  const result = requireRegisteredProject(options, slug);
  if (result.error) {
    return result;
  }
  if (result.registered.project.slug === options.adminProject.slug) {
    const locked: AdminProjectLookup = {
      error: ErrorCode.SystemProjectLocked,
      status: 409
    };

    return locked;
  }

  return result;
};
