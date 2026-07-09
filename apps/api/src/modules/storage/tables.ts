import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import type { MediaUploadPurpose } from "./media";

export const storageSettings = pgTable("auth_storage_settings", {
  projectSlug: text("project_slug").primaryKey(),
  provider: text("provider").notNull().default("none"),
  enabled: boolean("enabled").notNull().default(false),
  endpoint: text("endpoint").notNull().default(""),
  region: text("region").notNull().default("auto"),
  bucket: text("bucket").notNull().default(""),
  publicBaseUrl: text("public_base_url").notNull().default(""),
  accessKeyIdCipher: text("access_key_id_cipher").notNull().default(""),
  secretAccessKeyCipher: text("secret_access_key_cipher").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const storageObjects = pgTable("auth_storage_objects", {
  id: text("id").primaryKey(),
  purpose: text("purpose").$type<MediaUploadPurpose>().notNull(),
  bucket: text("bucket").notNull(),
  objectKey: text("object_key").notNull(),
  publicUrl: text("public_url").notNull(),
  originalFileName: text("original_file_name").notNull().default(""),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  checksumSha256: text("checksum_sha256").notNull(),
  ownerUserId: text("owner_user_id"),
  status: text("status").notNull().default("active"),
  supersededAt: timestamp("superseded_at", { withTimezone: true }),
  deleteAttempts: integer("delete_attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
