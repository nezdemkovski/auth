import { boolean, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import type { Realm } from "./model";

export const realmSettings = pgTable("auth_project_settings", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  schema: text("schema").notNull(),
  description: text("description").notNull().default(""),
  iconUrl: text("icon_url").notNull().default(""),
  appUrl: text("app_url").notNull().default(""),
  trustedOrigins: jsonb("trusted_origins")
    .$type<Realm["trustedOrigins"]>()
    .notNull(),
  features: jsonb("features")
    .$type<Realm["features"]>()
    .notNull(),
  system: boolean("system").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
