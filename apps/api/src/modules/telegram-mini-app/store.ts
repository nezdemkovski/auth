import {
  decryptSecretValue,
  encryptSecretValue,
  type AdminDatabaseOptions,
  withAdminDb
} from "@nezdemkovski/auth-platform-database";
import { eq, sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

const telegramMiniAppConnections = pgTable(
  "auth_telegram_mini_app_connections",
  {
    projectSlug: text("project_slug").primaryKey(),
    botUsername: text("bot_username").notNull(),
    botTokenCipher: text("bot_token_cipher").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  }
);

export type TelegramMiniAppRuntimeSettings = {
  botUsername: string;
  botToken: string;
};

export type TelegramMiniAppConnection = {
  botUsername: string;
};

export type TelegramMiniAppStore = {
  loadAll(): Promise<Map<string, TelegramMiniAppRuntimeSettings>>;
  read(projectSlug: string): Promise<TelegramMiniAppRuntimeSettings | null>;
  readConnection(
    projectSlug: string
  ): Promise<TelegramMiniAppConnection | null>;
  save(
    projectSlug: string,
    settings: TelegramMiniAppRuntimeSettings
  ): Promise<void>;
  delete(projectSlug: string): Promise<void>;
};

type StoreOptions = AdminDatabaseOptions & {
  encryptionSecret: string;
};

export const ensureTelegramMiniAppConnectionTable = async (
  options: AdminDatabaseOptions
) => {
  await withAdminDb(options, async ({ db }) => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS auth_telegram_mini_app_connections (
        project_slug text PRIMARY KEY REFERENCES auth_project_settings(slug) ON DELETE CASCADE,
        bot_username text NOT NULL,
        bot_token_cipher text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  });
};

export const createTelegramMiniAppStore = (
  options: StoreOptions
): TelegramMiniAppStore => ({
  loadAll: () =>
    withAdminDb(options, async ({ db }) => {
      const rows = await db.select().from(telegramMiniAppConnections);
      const settings = new Map<string, TelegramMiniAppRuntimeSettings>();

      for (const row of rows) {
        settings.set(row.projectSlug, {
          botUsername: row.botUsername,
          botToken: await decryptBotToken(
            row.botTokenCipher,
            options.encryptionSecret,
            row.projectSlug
          )
        });
      }

      return settings;
    }),
  read: (projectSlug) =>
    withAdminDb(options, async ({ db }) => {
      const rows = await db
        .select()
        .from(telegramMiniAppConnections)
        .where(eq(telegramMiniAppConnections.projectSlug, projectSlug))
        .limit(1);
      const row = rows[0];
      if (!row) {
        return null;
      }

      return {
        botUsername: row.botUsername,
        botToken: await decryptBotToken(
          row.botTokenCipher,
          options.encryptionSecret,
          row.projectSlug
        )
      };
    }),
  readConnection: (projectSlug) =>
    withAdminDb(options, async ({ db }) => {
      const rows = await db
        .select({ botUsername: telegramMiniAppConnections.botUsername })
        .from(telegramMiniAppConnections)
        .where(eq(telegramMiniAppConnections.projectSlug, projectSlug))
        .limit(1);

      return rows[0] ?? null;
    }),
  save: async (projectSlug, settings) => {
    const botTokenCipher = await encryptBotToken(
      settings.botToken,
      options.encryptionSecret,
      projectSlug
    );

    await withAdminDb(options, async ({ db }) => {
      await db
        .insert(telegramMiniAppConnections)
        .values({
          projectSlug,
          botUsername: settings.botUsername,
          botTokenCipher
        })
        .onConflictDoUpdate({
          target: telegramMiniAppConnections.projectSlug,
          set: {
            botUsername: settings.botUsername,
            botTokenCipher,
            updatedAt: new Date()
          }
        });
    });
  },
  delete: (projectSlug) =>
    withAdminDb(options, async ({ db }) => {
      await db
        .delete(telegramMiniAppConnections)
        .where(eq(telegramMiniAppConnections.projectSlug, projectSlug));
    })
});

const encryptBotToken = (
  value: string,
  secret: string,
  projectSlug: string
) => encryptSecretValue(value, secret, encryptionContext(projectSlug));

const decryptBotToken = (
  value: string,
  secret: string,
  projectSlug: string
) => decryptSecretValue(value, secret, encryptionContext(projectSlug));

const encryptionContext = (projectSlug: string) =>
  `telegram-mini-app:${projectSlug}:bot-token`;
