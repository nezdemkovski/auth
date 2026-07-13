import { ADMIN_REALM, type Realm } from "@nezdemkovski/auth-realm";
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

export const ADMIN_PROJECT: AuthProject = {
  ...ADMIN_REALM,
  billing: DEFAULT_PROJECT_BILLING,
  storage: DEFAULT_PROJECT_STORAGE
};
