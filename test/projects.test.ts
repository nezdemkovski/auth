import { describe, expect, test } from "bun:test";

import {
  ADMIN_PROJECT,
  DEFAULT_PROJECT_FEATURES,
  DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  normalizeProjectSlug,
  projectSchemaFromSlug,
  validateProjectSlug
} from "../src/config/projects";
import { normalizeProjectFeatures } from "../src/db/project-settings";

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
      socialProviders: DEFAULT_PROJECT_SOCIAL_PROVIDERS
    });
  });

  test("normalizes admin-created slugs", () => {
    expect(normalizeProjectSlug(" Open Markers! ")).toBe("open-markers");
  });

  test("derives an isolated schema from slug", () => {
    expect(projectSchemaFromSlug("open-markers")).toBe("open_markers_auth");
  });

  test("rejects invalid slugs", () => {
    expect(() => validateProjectSlug("bad_slug")).toThrow("Invalid project slug");
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
