import { describe, expect, test } from "bun:test";

import {
  ADMIN_PROJECT,
  DEFAULT_PROJECT_BILLING,
  DEFAULT_PROJECT_FEATURES,
  DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  normalizeProjectSlug,
  projectSchemaFromSlug,
  validateProjectSlug
} from "../src/config/projects";
import {
  createProjectFromInput,
  normalizeProjectFeatures,
  validateProjectSettingsPatch
} from "../src/db/project-settings";

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
      billing: DEFAULT_PROJECT_BILLING
    });
  });

  test("normalizes admin-created slugs", () => {
    expect(normalizeProjectSlug(" Open Markers! ")).toBe("open-markers");
  });

  test("derives an isolated schema from slug", () => {
    expect(projectSchemaFromSlug("open-markers")).toBe("open_markers_auth");
  });

  test("creates project settings with normalized slug, schema, and origins", () => {
    expect(
      createProjectFromInput({
        slug: " Open Markers ",
        name: " OpenMarkers ",
        description: " Marker maps ",
        iconUrl: "",
        appUrl: "https://openmarkers.app",
        trustedOrigins: [" https://openmarkers.app ", ""]
      })
    ).toMatchObject({
      slug: "open-markers",
      name: "OpenMarkers",
      schema: "open_markers_auth",
      description: "Marker maps",
      appUrl: "https://openmarkers.app",
      trustedOrigins: ["https://openmarkers.app"]
    });
  });

  test("rejects invalid slugs", () => {
    expect(() => validateProjectSlug("bad_slug")).toThrow("Invalid project slug");
  });

  test("rejects invalid project settings patches", () => {
    const patch = {
      name: "OpenMarkers",
      description: "",
      iconUrl: "",
      appUrl: "https://openmarkers.app",
      trustedOrigins: ["https://openmarkers.app"],
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
        trustedOrigins: ["https://openmarkers.app/path"]
      })
    ).toThrow("Invalid trusted origin");
    expect(() =>
      validateProjectSettingsPatch({
        ...patch,
        trustedOrigins: ["https://openmarkers.app", "https://openmarkers.app"]
      })
    ).toThrow("Duplicate trusted origin");
  });

  test("normalizes realm feature flags", () => {
    expect(
      normalizeProjectFeatures({
        passkey: { enabled: true },
        twoFactor: { enabled: true, required: "everyone" },
        agentAuth: { enabled: true, mode: "scoped-write" },
        oauthProvider: { enabled: true, dynamicClientRegistration: true }
      })
    ).toEqual({
      passkey: { enabled: true },
      twoFactor: { enabled: true, required: "everyone" },
      agentAuth: { enabled: true, mode: "scoped-write" },
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
      twoFactor: { enabled: true, required: "optional" },
      agentAuth: { enabled: true, mode: "read-only" },
      oauthProvider: { enabled: false, dynamicClientRegistration: false }
    });
  });
});
