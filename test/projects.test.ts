import { describe, expect, test } from "bun:test";

import {
  ADMIN_PROJECT,
  normalizeProjectSlug,
  projectSchemaFromSlug,
  validateProjectSlug
} from "../src/config/projects";

describe("projects", () => {
  test("uses a stable built-in admin project", () => {
    expect(ADMIN_PROJECT).toEqual({
      slug: "admin",
      name: "Auth Admin",
      schema: "auth_admin",
      description: "System admin realm for managing auth projects.",
      iconUrl: "",
      appUrl: "",
      trustedOrigins: []
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
});
