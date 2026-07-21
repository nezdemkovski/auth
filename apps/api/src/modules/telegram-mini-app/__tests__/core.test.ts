import { describe, expect, test } from "bun:test";
import { DEFAULT_PROJECT_BILLING } from "@nezdemkovski/auth-billing";
import {
  DEFAULT_REALM_FEATURES,
  DEFAULT_REALM_SOCIAL_PROVIDERS
} from "@nezdemkovski/auth-realm";
import { DEFAULT_PROJECT_STORAGE } from "@nezdemkovski/auth-storage";

import type { AuthProject } from "../../../config/projects";
import { TelegramMiniAppService } from "../core";
import type {
  TelegramMiniAppRuntimeSettings,
  TelegramMiniAppStore
} from "../store";

const project: AuthProject = {
  slug: "demo",
  name: "Demo App",
  schema: "demo_auth",
  description: "",
  iconUrl: "",
  appUrl: "https://demo.example.com",
  trustedOrigins: ["https://demo.example.com"],
  features: DEFAULT_REALM_FEATURES,
  socialProviders: DEFAULT_REALM_SOCIAL_PROVIDERS,
  billing: DEFAULT_PROJECT_BILLING,
  storage: DEFAULT_PROJECT_STORAGE
};

const createStoreFake = (
  initial: Map<string, TelegramMiniAppRuntimeSettings>
) => {
  const persisted = new Map(initial);
  const store: TelegramMiniAppStore = {
    loadAll: async () => new Map(persisted),
    read: async (projectSlug) => persisted.get(projectSlug) ?? null,
    readConnection: async (projectSlug) => {
      const settings = persisted.get(projectSlug);
      return settings ? { botUsername: settings.botUsername } : null;
    },
    save: async (projectSlug, settings) => {
      persisted.set(projectSlug, settings);
    },
    delete: async (projectSlug) => {
      persisted.delete(projectSlug);
    }
  };

  return { persisted, store };
};

describe("Telegram Mini App connection lifecycle", () => {
  test("applies a connection only after persistence and keeps runtime state in sync", async () => {
    const { persisted, store } = createStoreFake(new Map());
    const runtimeSettings = new Map<string, TelegramMiniAppRuntimeSettings>();
    const applied: string[] = [];
    const service = new TelegramMiniAppService({
      store,
      runtimeSettings,
      applyRuntimeSettings: async (realm) => {
        expect(persisted.has(realm.slug)).toBe(true);
        expect(runtimeSettings.has(realm.slug)).toBe(true);
        applied.push(realm.slug);
      }
    });

    await service.connect(project, {
      botUsername: "demo_auth_bot",
      botToken: "123456789:abcdefghijklmnopqrstuvwxyz"
    });

    expect(applied).toEqual(["demo"]);
    expect(await service.read("demo")).toEqual({
      botUsername: "demo_auth_bot"
    });
  });

  test("restores the previous connection when the realm runtime cannot rebuild", async () => {
    const previous = {
      botUsername: "previous_bot",
      botToken: "123456789:previous-telegram-token"
    };
    const { persisted, store } = createStoreFake(
      new Map([[project.slug, previous]])
    );
    const runtimeSettings = new Map([[project.slug, previous]]);
    const service = new TelegramMiniAppService({
      store,
      runtimeSettings,
      applyRuntimeSettings: async () => {
        throw new Error("runtime rebuild failed");
      }
    });

    await expect(
      service.connect(project, {
        botUsername: "new_demo_bot",
        botToken: "123456789:new-telegram-token"
      })
    ).rejects.toThrow("runtime rebuild failed");

    expect(persisted.get(project.slug)).toEqual(previous);
    expect(runtimeSettings.get(project.slug)).toEqual(previous);
  });
});
