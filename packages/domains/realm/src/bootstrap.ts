import type { AdminDatabaseOptions } from "@nezdemkovski/auth-platform-database";

import { ensureRealmSocialProviderSettingsTable } from "./social-provider-store";
import { ensureRealmSettingsTable } from "./store";

export const ensureRealmTables = async (options: AdminDatabaseOptions) => {
  await ensureRealmSettingsTable(options);
  await ensureRealmSocialProviderSettingsTable(options);
};
