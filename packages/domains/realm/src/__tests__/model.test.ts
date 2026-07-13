import { describe, expect, test } from "bun:test";

import {
  ADMIN_REALM,
  DEFAULT_REALM_FEATURES,
  DEFAULT_REALM_SOCIAL_PROVIDERS,
  normalizeRealmSlug,
  realmSchemaFromSlug,
  validateRealmSlug
} from "../model";

describe("realm model", () => {
  test("uses a stable built-in admin realm", () => {
    expect(ADMIN_REALM).toEqual({
      slug: "admin",
      name: "Auth Admin",
      schema: "auth_admin",
      description: "System admin realm for managing auth projects.",
      iconUrl: "",
      appUrl: "",
      trustedOrigins: [],
      features: DEFAULT_REALM_FEATURES,
      socialProviders: DEFAULT_REALM_SOCIAL_PROVIDERS
    });
  });

  test("normalizes realm slugs and derives isolated schemas", () => {
    expect(normalizeRealmSlug(" Demo Portal! ")).toBe("demo-portal");
    expect(realmSchemaFromSlug("demo-portal")).toBe("demo_portal_auth");
  });

  test("rejects invalid realm slugs", () => {
    expect(() => validateRealmSlug("bad_slug")).toThrow("Invalid project slug");
    expect(() => validateRealmSlug("a".repeat(59))).toThrow("Invalid project slug");
  });
});
