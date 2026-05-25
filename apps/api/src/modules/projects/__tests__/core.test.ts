import { describe, expect, test } from "bun:test";

import {
  ADMIN_PROJECT,
  DEFAULT_PROJECT_BILLING,
  DEFAULT_PROJECT_FEATURES,
  DEFAULT_PROJECT_STORAGE,
  DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  ProjectAgentAuthMode,
  ProjectTwoFactorRequirement,
  normalizeProjectSlug,
  projectSchemaFromSlug,
  validateProjectSlug
} from "../../../config/projects";
import {
  normalizeProjectFeatures,
  validateProjectSettingsPatch
} from "../validator";
import { createProjectFromInput } from "../core";

describe("projects", () => {
  test("uses a stable built-in admin project", () => {
    expect(ADMIN_PROJECT).toEqual({
      slug: "admin",
      name: "Auth Admin",
      schema: "auth_admin",
      description: "System admin realm for managing auth projects.",
      iconUrl: "",
      appUrl: "",
      trustedOrigins: [],
      features: DEFAULT_PROJECT_FEATURES,
      socialProviders: DEFAULT_PROJECT_SOCIAL_PROVIDERS,
      billing: DEFAULT_PROJECT_BILLING,
      storage: DEFAULT_PROJECT_STORAGE
    });
  });

  test("normalizes admin-created slugs", () => {
    expect(normalizeProjectSlug(" Demo Portal! ")).toBe("demo-portal");
  });

  test("derives an isolated schema from slug", () => {
    expect(projectSchemaFromSlug("demo-portal")).toBe("demo_portal_auth");
  });

  test("creates project settings with normalized slug, schema, and origins", () => {
    expect(
      createProjectFromInput({
        slug: " Demo Portal ",
        name: " Demo App ",
        description: " Marker maps ",
        iconUrl: "",
        appUrl: "https://demo.example.com",
        trustedOrigins: [" https://demo.example.com ", ""]
      })
    ).toMatchObject({
      slug: "demo-portal",
      name: "Demo App",
      schema: "demo_portal_auth",
      description: "Marker maps",
      appUrl: "https://demo.example.com",
      trustedOrigins: ["https://demo.example.com"]
    });
  });

  test("rejects invalid slugs", () => {
    expect(() => validateProjectSlug("bad_slug")).toThrow("Invalid project slug");
  });

  test("rejects invalid project settings patches", () => {
    const patch = {
      name: "Demo App",
      description: "",
      iconUrl: "",
      appUrl: "https://demo.example.com",
      trustedOrigins: ["https://demo.example.com"],
      features: DEFAULT_PROJECT_FEATURES
    };

    expect(() =>
      validateProjectSettingsPatch({
        ...patch,
        name: " "
      })
    ).toThrow("Project name is required");
    expect(() =>
      validateProjectSettingsPatch({
        ...patch,
        appUrl: "javascript:alert(1)"
      })
    ).toThrow("Invalid appUrl");
    expect(() =>
      validateProjectSettingsPatch({
        ...patch,
        trustedOrigins: ["https://demo.example.com/path"]
      })
    ).toThrow("Invalid trusted origin");
    expect(() =>
      validateProjectSettingsPatch({
        ...patch,
        trustedOrigins: ["https://demo.example.com", "https://demo.example.com"]
      })
    ).toThrow("Duplicate trusted origin");
  });

  test("normalizes realm feature flags", () => {
    expect(
      normalizeProjectFeatures({
        passkey: { enabled: true },
        twoFactor: { enabled: true, required: ProjectTwoFactorRequirement.Everyone },
        agentAuth: { enabled: true, mode: ProjectAgentAuthMode.ScopedWrite },
        oauthProvider: { enabled: true, dynamicClientRegistration: true }
      })
    ).toEqual({
      passkey: { enabled: true },
      twoFactor: { enabled: true, required: ProjectTwoFactorRequirement.Everyone },
      agentAuth: { enabled: true, mode: ProjectAgentAuthMode.ScopedWrite },
      oauthProvider: { enabled: true, dynamicClientRegistration: true }
    });
  });

  test("falls back to disabled feature flags for invalid input", () => {
    expect(
      normalizeProjectFeatures({
        passkey: { enabled: "yes" },
        twoFactor: { enabled: true, required: "root" },
        agentAuth: { enabled: true, mode: "god-mode" },
        oauthProvider: { enabled: "yes", dynamicClientRegistration: "sure" }
      })
    ).toEqual({
      passkey: { enabled: false },
      twoFactor: { enabled: true, required: ProjectTwoFactorRequirement.Optional },
      agentAuth: { enabled: true, mode: ProjectAgentAuthMode.ReadOnly },
      oauthProvider: { enabled: false, dynamicClientRegistration: false }
    });
  });
});
