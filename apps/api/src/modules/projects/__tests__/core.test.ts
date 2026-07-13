import { describe, expect, test } from "bun:test";
import { DEFAULT_PROJECT_BILLING } from "@nezdemkovski/auth-billing";
import {
  DEFAULT_REALM_FEATURES,
  DEFAULT_REALM_SOCIAL_PROVIDERS
} from "@nezdemkovski/auth-realm";
import { DEFAULT_PROJECT_STORAGE } from "@nezdemkovski/auth-storage";

import { ADMIN_PROJECT } from "../../../config/projects";
import { createProjectFromInput } from "../core";

describe("project application aggregate", () => {
  test("composes the built-in realm with default capabilities", () => {
    expect(ADMIN_PROJECT).toEqual({
      slug: "admin",
      name: "Auth Admin",
      schema: "auth_admin",
      description: "System admin realm for managing auth projects.",
      iconUrl: "",
      appUrl: "",
      trustedOrigins: [],
      features: DEFAULT_REALM_FEATURES,
      socialProviders: DEFAULT_REALM_SOCIAL_PROVIDERS,
      billing: DEFAULT_PROJECT_BILLING,
      storage: DEFAULT_PROJECT_STORAGE
    });
  });

  test("composes normalized realm settings with default capabilities", () => {
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
      trustedOrigins: ["https://demo.example.com"],
      billing: DEFAULT_PROJECT_BILLING,
      storage: DEFAULT_PROJECT_STORAGE
    });
  });
});
