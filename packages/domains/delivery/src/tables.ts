import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const deliverySettings = pgTable("auth_delivery_settings", {
  key: text("key").primaryKey().default("default"),
  provider: text("provider").notNull().default("none"),
  fromAddress: text("from_address").notNull().default(""),
  cloudflareAccountId: text("cloudflare_account_id").notNull().default(""),
  cloudflareApiTokenCipher: text("cloudflare_api_token_cipher").notNull().default(""),
  resendApiKeyCipher: text("resend_api_key_cipher").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
