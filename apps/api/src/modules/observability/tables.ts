import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const observabilitySettings = pgTable("auth_observability_settings", {
  key: text("key").primaryKey().default("default"),
  provider: text("provider").notNull().default("none"),
  enabled: boolean("enabled").notNull().default(false),
  dsnCipher: text("dsn_cipher").notNull().default(""),
  environment: text("environment").notNull().default("production"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
