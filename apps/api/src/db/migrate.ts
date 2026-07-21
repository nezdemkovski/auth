import type { Env } from "../config/env";
import { createAdminDatabase } from "./admin-pool";
import { bootstrapProjects, prepareProjectSchema } from "./bootstrap";
import { loadEffectiveProjects } from "../application/project-catalog";
import {
  createTelegramMiniAppAuthPluginContribution
} from "../modules/telegram-mini-app/better-auth";
import { createTelegramMiniAppStore } from "../modules/telegram-mini-app/store";

export const migrateDatabase = async (env: Env) => {
  await bootstrapProjects({
    databaseUrl: env.databaseUrl,
    publicBaseUrl: env.publicBaseUrl,
    secret: env.betterAuthSecret,
    adminProject: env.adminProject,
    adminEmail: env.adminEmail,
    encryptionSecret: env.secretEncryptionKey,
    initialDeliveryConfig: env.email
  });

  const adminDb = createAdminDatabase(env.databaseUrl, env.adminProject);
  try {
    const { projects } = await loadEffectiveProjects({
      databaseUrl: env.databaseUrl,
      adminProject: env.adminProject,
      adminDb,
      encryptionSecret: env.secretEncryptionKey,
      managedStorage: env.storage
    });
    const telegramMiniAppStore = createTelegramMiniAppStore({
      databaseUrl: env.databaseUrl,
      adminProject: env.adminProject,
      adminDb,
      encryptionSecret: env.secretEncryptionKey
    });
    const telegramMiniAppSettings = await telegramMiniAppStore.loadAll();
    const telegramMiniAppContribution =
      createTelegramMiniAppAuthPluginContribution(telegramMiniAppSettings);

    for (const project of projects) {
      await prepareProjectSchema({
        databaseUrl: env.databaseUrl,
        publicBaseUrl: env.publicBaseUrl,
        secret: env.betterAuthSecret,
        project,
        pluginContributions: [telegramMiniAppContribution]
      });
    }

    return projects.length + 1;
  } finally {
    await adminDb.pool.end();
  }
};
