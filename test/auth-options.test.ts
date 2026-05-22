import { describe, expect, test } from "bun:test";
import type { Pool } from "pg";

import {
  __projectAuthTestUtils,
  createProjectMigrationAuthOptions
} from "../src/auth/project-auth";
import {
  DEFAULT_PROJECT_FEATURES,
  DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  type AuthProject
} from "../src/config/projects";

const baseProject: AuthProject = {
  slug: "openmarkers",
  name: "OpenMarkers",
  schema: "openmarkers_auth",
  description: "Marker maps",
  iconUrl: "",
  appUrl: "https://openmarkers.app",
  trustedOrigins: ["https://openmarkers.app"],
  features: DEFAULT_PROJECT_FEATURES,
  socialProviders: DEFAULT_PROJECT_SOCIAL_PROVIDERS
};

function createOptions(project: AuthProject, trustProxyHeaders = false) {
  return __projectAuthTestUtils.createBaseProjectAuthOptions({
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
    pool: {} as Pool,
    publicBaseUrl: "https://auth.example.com",
    secret: "x".repeat(32)
  });
}

describe("project auth options", () => {
  test("builds isolated Better Auth settings per realm", () => {
    const options = createOptions(baseProject);

    expect(options.appName).toBe("OpenMarkers");
    expect(options.baseURL).toBe("https://auth.example.com/openmarkers/api/auth");
    expect(options.trustedOrigins).toEqual(["https://openmarkers.app"]);
    expect(options.advanced?.cookiePrefix).toBe("auth_openmarkers");
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
    expect(pluginIds).not.toContain("test-utils");
  });

  test("trusts proxy IP headers only when explicitly enabled", () => {
    expect(createOptions(baseProject).advanced?.ipAddress).toBeUndefined();
    expect(createOptions(baseProject, true).advanced?.ipAddress).toEqual({
      ipAddressHeaders: [
        "cf-connecting-ip",
        "x-forwarded-for",
        "x-real-ip",
        "x-client-ip"
      ]
    });
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
    const socialProviders = options.socialProviders as Record<
      string,
      { enabled?: boolean }
    >;
    expect(socialProviders.google?.enabled).toBe(false);
    expect(socialProviders.twitter?.enabled).toBe(false);
    expect(socialProviders.facebook?.enabled).toBe(false);
  });
});
