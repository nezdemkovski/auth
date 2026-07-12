import { describe, expect, test } from "bun:test";

import {
  buildOAuthValidAudiences,
  createBaseProjectAuthOptions,
  createProjectMigrationAuthOptions,
  projectAuthSecret
} from "../project-auth";
import {
  BillingProvider,
  DEFAULT_PROJECT_FEATURES,
  DEFAULT_PROJECT_BILLING,
  DEFAULT_PROJECT_STORAGE,
  DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  type AuthProject
} from "../../config/projects";
import type { EmailSender } from "../../email/sender";

const baseProject: AuthProject = {
  slug: "demo",
  name: "Demo App",
  schema: "demo_auth",
  description: "Marker maps",
  iconUrl: "",
  appUrl: "https://demo.example.com",
  trustedOrigins: ["https://demo.example.com"],
  features: DEFAULT_PROJECT_FEATURES,
  socialProviders: DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  billing: DEFAULT_PROJECT_BILLING,
  storage: DEFAULT_PROJECT_STORAGE
};

function createOptions(project: AuthProject, trustProxyHeaders = false) {
  return createBaseProjectAuthOptions({
    project,
    publicBaseUrl: "https://auth.example.com",
    secret: "x".repeat(32),
    emailSender: null,
    trustProxyHeaders
  });
}

function createMigrationOptions(project: AuthProject) {
  return createProjectMigrationAuthOptions({
    project,
    database: undefined,
    publicBaseUrl: "https://auth.example.com",
    secret: "x".repeat(32)
  });
}

const emailSender: EmailSender = {
  send: async () => {}
};

describe("project auth options", () => {
  test("pins the OAuth provider to the first release candidate containing audience binding", async () => {
    const manifest = await Bun.file(
      new URL("../../../package.json", import.meta.url)
    ).json();

    expect(manifest.dependencies["@better-auth/oauth-provider"]).toBe(
      "1.7.0-rc.1"
    );
  });

  test("builds isolated Better Auth settings per realm", () => {
    const options = createOptions(baseProject);

    expect(options.appName).toBe("Demo App");
    expect(options.baseURL).toBe("https://auth.example.com/api/demo/auth");
    expect(options.trustedOrigins).toEqual(["https://demo.example.com"]);
    expect(options.advanced?.cookiePrefix).toBe("auth_demo");
    expect(options.secret).toBe(projectAuthSecret("x".repeat(32), "demo"));
    expect(options.secret).not.toBe("x".repeat(32));
  });

  test("requires email verification when delivery is configured", () => {
    const options = createBaseProjectAuthOptions({
      project: baseProject,
      publicBaseUrl: "https://auth.example.com",
      secret: "x".repeat(32),
      emailSender,
      trustProxyHeaders: false
    });

    expect(options.emailAndPassword?.requireEmailVerification).toBe(true);
    expect(createOptions(baseProject).emailAndPassword?.requireEmailVerification).toBeUndefined();
  });

  test("derives different Better Auth secrets per realm", () => {
    expect(projectAuthSecret("x".repeat(32), "demo")).not.toBe(
      projectAuthSecret("x".repeat(32), "another-demo")
    );
  });

  test("wires security-sensitive plugins without test helpers in production options", () => {
    const pluginIds = (createMigrationOptions(baseProject).plugins ?? []).map(
      (plugin) => plugin.id
    );

    expect(pluginIds).toContain("admin");
    expect(pluginIds).toContain("passkey");
    expect(pluginIds).toContain("two-factor");
    expect(pluginIds).toContain("agent-auth");
    expect(pluginIds).toContain("oauth-provider");
    expect(pluginIds).toContain("last-login-method");
    expect(pluginIds).toContain("bearer");
    expect(pluginIds).toContain("jwt");
    expect(pluginIds).not.toContain("polar");
    expect(pluginIds).not.toContain("test-utils");
  });

  test("adds Polar only when billing is enabled and configured", () => {
    const disabledPluginIds = (createOptions(baseProject).plugins ?? []).map(
      (plugin) => plugin.id
    );
    const enabledPluginIds = (
      createOptions({
        ...baseProject,
        billing: {
          ...DEFAULT_PROJECT_BILLING,
          provider: BillingProvider.Polar,
          enabled: true,
          accessToken: "polar-token"
        }
      }).plugins ?? []
    ).map((plugin) => plugin.id);

    expect(disabledPluginIds).not.toContain("polar");
    expect(enabledPluginIds).toContain("polar");
  });

  test("adds the Telegram Mini App plugin only when the realm enables it", () => {
    const disabledPluginIds = (createOptions(baseProject).plugins ?? []).map(
      (plugin) => plugin.id
    );
    const enabledPluginIds = (
      createOptions({
        ...baseProject,
        socialProviders: {
          ...DEFAULT_PROJECT_SOCIAL_PROVIDERS,
          telegram: {
            enabled: true,
            clientId: "demo_bot",
            clientSecret: "telegram-bot-token",
            verifiedAt: null
          }
        }
      }).plugins ?? []
    ).map((plugin) => plugin.id);

    expect(disabledPluginIds).not.toContain("telegram");
    expect(enabledPluginIds).toContain("telegram");
  });

  test("trusts proxy IP headers only when explicitly enabled", () => {
    expect(createOptions(baseProject).advanced?.ipAddress).toBeUndefined();
    expect(createOptions(baseProject, true).advanced?.ipAddress).toEqual({
      ipAddressHeaders: ["x-auth-client-ip"]
    });
  });

  test("allows OAuth tokens for trusted app resources", () => {
    expect(
      buildOAuthValidAudiences(
        baseProject,
        "https://auth.example.com"
      )
    ).toEqual([
      "https://auth.example.com/api/demo",
      "https://auth.example.com/api/demo/auth",
      "https://demo.example.com",
      "https://demo.example.com/mcp"
    ]);
  });

  test("enables social providers only when enabled and fully configured", () => {
    const options = createOptions({
      ...baseProject,
      socialProviders: {
        ...DEFAULT_PROJECT_SOCIAL_PROVIDERS,
        github: {
          enabled: true,
          clientId: "github-client",
          clientSecret: "github-secret",
          verifiedAt: null
        },
        google: {
          enabled: true,
          clientId: "google-client",
          clientSecret: "",
          verifiedAt: null
        }
      }
    });

    expect(options.socialProviders?.github).toEqual({
      enabled: true,
      clientId: "github-client",
      clientSecret: "github-secret"
    });
    expect(providerEnabled(options.socialProviders?.google)).toBe(false);
    expect(providerEnabled(options.socialProviders?.twitter)).toBe(false);
    expect(providerEnabled(options.socialProviders?.facebook)).toBe(false);
  });
});

function providerEnabled(provider: unknown) {
  if (
    typeof provider === "object" &&
    provider !== null &&
    "enabled" in provider
  ) {
    return provider.enabled === true;
  }

  return false;
}
