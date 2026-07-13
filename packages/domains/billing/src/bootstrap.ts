import type { AdminDatabaseOptions } from "@nezdemkovski/auth-platform-database";

import { ensureBillingSettingsTable } from "./store";
import { ensureBillingUsageTables } from "./usage-store";
import { ensureBillingWebhookTables } from "./webhook-store";

export const ensureBillingTables = async (options: AdminDatabaseOptions) => {
  await ensureBillingSettingsTable(options);
  await ensureBillingWebhookTables(options);
  await ensureBillingUsageTables(options);
};
