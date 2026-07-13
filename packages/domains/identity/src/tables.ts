import {
  boolean,
  pgTable,
  text,
  timestamp
} from "drizzle-orm/pg-core";

// These mappings describe Better Auth-owned tables. This package may query
// them for identity administration, but it does not migrate or replace them.
export const identityUsers = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  emailVerified: boolean("emailVerified").notNull(),
  image: text("image"),
  role: text("role"),
  banned: boolean("banned"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull()
});

export const identitySessions = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull()
});

// This is platform-owned administrative state, separate from Better Auth's
// authentication model.
export const identityBootstrapState = pgTable("auth_bootstrap_state", {
  key: text("key").primaryKey(),
  userId: text("user_id").notNull(),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  changedAt: timestamp("changed_at", { withTimezone: true })
});
