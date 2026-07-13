import { boolean, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const realmSocialProviderSettings = pgTable(
  "auth_social_provider_settings",
  {
    projectSlug: text("project_slug").notNull(),
    provider: text("provider").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    clientId: text("client_id").notNull().default(""),
    clientSecretCipher: text("client_secret_cipher").notNull().default(""),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [primaryKey({ columns: [table.projectSlug, table.provider] })]
);
