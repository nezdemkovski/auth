import {
  cloneDefaultBilling,
  loadBillingSettings
} from "@nezdemkovski/auth-billing";
import {
  cloneDefaultStorage,
  loadStorageSettings,
  type ProjectStorageSettings
} from "@nezdemkovski/auth-storage";

import type { AuthProject } from "../config/projects";
import type { AdminDatabaseOptions } from "../db/admin-pool";
import {
  cloneDefaultSocialProviders,
  loadSocialProviderSettings
} from "../modules/projects/social-provider-store";
import { readProjectSettings } from "../modules/projects/store";

export const loadEffectiveProjects = async (
  options: AdminDatabaseOptions & {
    encryptionSecret: string;
    managedStorage: ProjectStorageSettings;
  }
) => {
  const all = await readProjectSettings(options);
  const socialProviders = await loadSocialProviderSettings(options);
  const billingSettings = await loadBillingSettings(options);
  const storageSettings = await loadStorageSettings(options);
  const allWithSettings: AuthProject[] = all.map((project) => ({
    ...project,
    socialProviders:
      socialProviders.get(project.slug) ?? cloneDefaultSocialProviders(),
    billing: billingSettings.get(project.slug) ?? cloneDefaultBilling(),
    storage:
      storageSettings.get(project.slug) ??
      cloneDefaultStorage(options.managedStorage)
  }));
  const bySlug = new Map(allWithSettings.map((project) => [project.slug, project]));
  const adminProject = bySlug.get(options.adminProject.slug) ?? options.adminProject;

  return {
    adminProject,
    projects: allWithSettings.filter((project) => project.slug !== adminProject.slug)
  };
};
