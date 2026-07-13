import {
  ADMIN_REALM,
  ADMIN_REALM_SLUG,
  DEFAULT_REALM_FEATURES,
  DEFAULT_REALM_SOCIAL_PROVIDERS,
  MAX_REALM_SLUG_LENGTH,
  RealmAgentAuthMode,
  RealmTwoFactorRequirement,
  normalizeRealmSlug,
  realmSchemaFromSlug,
  validateRealmSchema,
  validateRealmSlug,
  type Realm,
  type RealmFeatures,
  type RealmSocialProvider,
  type RealmSocialProviders
} from "@nezdemkovski/auth-realm";
import {
  DEFAULT_PROJECT_BILLING,
  type ProjectBillingSettings
} from "@nezdemkovski/auth-billing";
import {
  DEFAULT_PROJECT_STORAGE,
  type ProjectStorageSettings
} from "@nezdemkovski/auth-storage";

export type AuthProject = Realm & {
  billing: ProjectBillingSettings;
  storage: ProjectStorageSettings;
};

export type ProjectFeatures = RealmFeatures;
export type ProjectSocialProvider = RealmSocialProvider;
export type ProjectSocialProviders = RealmSocialProviders;

export {
  RealmAgentAuthMode as ProjectAgentAuthMode,
  RealmTwoFactorRequirement as ProjectTwoFactorRequirement
};

export enum AuthUserRole {
  Admin = "admin",
  User = "user"
}

export const DEFAULT_PROJECT_FEATURES = DEFAULT_REALM_FEATURES;
export const DEFAULT_PROJECT_SOCIAL_PROVIDERS = DEFAULT_REALM_SOCIAL_PROVIDERS;
export const ADMIN_PROJECT_SLUG = ADMIN_REALM_SLUG;
export const MAX_PROJECT_SLUG_LENGTH = MAX_REALM_SLUG_LENGTH;

export const ADMIN_PROJECT: AuthProject = {
  ...ADMIN_REALM,
  billing: DEFAULT_PROJECT_BILLING,
  storage: DEFAULT_PROJECT_STORAGE
};

export const findProject = (projects: AuthProject[], slug: string) => {
  return projects.find((project) => project.slug === slug) ?? null;
};

export const normalizeProjectSlug = normalizeRealmSlug;
export const projectSchemaFromSlug = realmSchemaFromSlug;
export const validateProjectSlug = validateRealmSlug;
export const validateProjectSchema = validateRealmSchema;
