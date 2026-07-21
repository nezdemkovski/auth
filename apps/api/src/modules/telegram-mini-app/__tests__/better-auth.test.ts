import { describe, expect, test } from "bun:test";
import { DEFAULT_PROJECT_BILLING } from "@nezdemkovski/auth-billing";
import {
  DEFAULT_REALM_FEATURES,
  DEFAULT_REALM_SOCIAL_PROVIDERS
} from "@nezdemkovski/auth-realm";
import { DEFAULT_PROJECT_STORAGE } from "@nezdemkovski/auth-storage";

import type { AuthProject } from "../../../config/projects";
import { createTelegramMiniAppAuthPluginContribution } from "../better-auth";

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

describe("Telegram Mini App Better Auth contribution", () => {
  test("contributes the published plugin only to its connected realm", () => {
    const contribute = createTelegramMiniAppAuthPluginContribution(
      new Map([
        [
          "demo",
          {
            botUsername: "demo_auth_bot",
            botToken: "123456789:abcdefghijklmnopqrstuvwxyz"
          }
        ]
      ])
    );

    const plugins = contribute(project);
    expect(plugins.map((plugin) => plugin.id)).toEqual(["telegram"]);
    expect(Object.keys(plugins[0]?.endpoints ?? {}).sort()).toEqual([
      "getTelegramConfig",
      "signInWithMiniApp",
      "validateMiniApp"
    ]);
    expect(contribute({ ...project, slug: "other" })).toEqual([]);
  });
});
