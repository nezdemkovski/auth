import { describe, expect, test } from "bun:test";

import {
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
  ProjectTwoFactorRequirement,
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
    const options = createMigrationOptions(baseProject);
    const plugins = options.plugins ?? [];
    const pluginIds = plugins.map(
      (plugin) => plugin.id
    );

    expect(options.disabledPaths).toEqual(["/token"]);
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

    const jwtPlugin = plugins.find((plugin) => plugin.id === "jwt");
    expect(jwtPlugin ? Reflect.get(jwtPlugin, "options") : null).toMatchObject({
      disableSettingJwtHeader: true
    });
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

  test("configures Telegram through Better Auth Generic OAuth with OIDC and PKCE", () => {
    const disabledPluginIds = (createOptions(baseProject).plugins ?? []).map(
      (plugin) => plugin.id
    );
    const enabledPlugins =
      createOptions({
        ...baseProject,
        socialProviders: {
          ...DEFAULT_PROJECT_SOCIAL_PROVIDERS,
          telegram: {
            enabled: true,
            clientId: "telegram-client",
            clientSecret: "telegram-oidc-secret",
            verifiedAt: null
          }
        }
      }).plugins ?? [];
    const telegramPlugin = enabledPlugins.find(
      (plugin) => plugin.id === "generic-oauth"
    );
    const telegramOptions = telegramPlugin
      ? Reflect.get(telegramPlugin, "options")
      : null;

    expect(disabledPluginIds).not.toContain("generic-oauth");
    expect(telegramOptions).toMatchObject({
      config: [
        {
          providerId: "telegram",
          discoveryUrl:
            "https://oauth.telegram.org/.well-known/openid-configuration",
          clientId: "telegram-client",
          clientSecret: "telegram-oidc-secret",
          authentication: "basic",
          scopes: ["openid", "profile"],
          pkce: true
        }
      ]
    });
  });

  test("trusts proxy IP headers only when explicitly enabled", () => {
    expect(createOptions(baseProject).advanced?.ipAddress).toBeUndefined();
    expect(createOptions(baseProject, true).advanced?.ipAddress).toEqual({
      ipAddressHeaders: ["x-auth-client-ip"]
    });
  });

  test("does not derive OAuth resources from browser trust settings", () => {
    const oauthPlugin = (createMigrationOptions(baseProject).plugins ?? [])
      .find((plugin) => plugin.id === "oauth-provider");
    const oauthOptions = oauthPlugin
      ? Reflect.get(oauthPlugin, "options")
      : null;

    expect(oauthOptions).toMatchObject({
      scopes: ["openid", "profile", "email", "offline_access"]
    });
    expect(oauthOptions ? Reflect.get(oauthOptions, "resources") : null)
      .toBeUndefined();
    expect(oauthOptions ? Reflect.get(oauthOptions, "validAudiences") : null)
      .toBeUndefined();
  });

  test("uses the OAuth Provider post-login hook for product security policy", async () => {
    const project = {
      ...baseProject,
      features: {
        ...DEFAULT_PROJECT_FEATURES,
        passkey: {
          enabled: true
        },
        twoFactor: {
          enabled: true,
          required: ProjectTwoFactorRequirement.Everyone
        }
      }
    };
    const oauthPlugin = (createMigrationOptions(project).plugins ?? [])
      .find((plugin) => plugin.id === "oauth-provider");
    const oauthOptions = oauthPlugin
      ? Reflect.get(oauthPlugin, "options")
      : null;
    const postLogin = oauthOptions
      ? Reflect.get(oauthOptions, "postLogin")
      : null;

    if (!postLogin) {
      throw new Error("Expected OAuth Provider post-login configuration");
    }

    expect(postLogin.page).toBe("/login/demo");
    const shouldRedirectBeforeEnrollment = await postLogin.shouldRedirect({
      headers: new Headers(),
      scopes: ["openid"],
      session: {
        id: "session-id",
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: "user-id",
        expiresAt: new Date(Date.now() + 60_000),
        token: "session-token"
      },
      user: {
        id: "user-id",
        createdAt: new Date(),
        updatedAt: new Date(),
        email: "user@example.com",
        emailVerified: true,
        name: "Demo User",
        role: "user",
        twoFactorEnabled: false
      }
    });
    const shouldRedirectAfterEnrollment = await postLogin.shouldRedirect({
      headers: new Headers(),
      scopes: ["openid"],
      session: {
        id: "session-id",
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: "user-id",
        expiresAt: new Date(Date.now() + 60_000),
        token: "session-token"
      },
      user: {
        id: "user-id",
        createdAt: new Date(),
        updatedAt: new Date(),
        email: "user@example.com",
        emailVerified: true,
        name: "Demo User",
        role: "user",
        twoFactorEnabled: true
      }
    });

    expect(shouldRedirectBeforeEnrollment).toBe(true);
    expect(shouldRedirectAfterEnrollment).toBe(false);
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
