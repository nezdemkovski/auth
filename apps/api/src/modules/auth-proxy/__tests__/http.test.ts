import { describe, expect, test } from "bun:test";

import {
  ADMIN_PROJECT,
  DEFAULT_PROJECT_BILLING,
  DEFAULT_PROJECT_FEATURES,
  DEFAULT_PROJECT_STORAGE,
  DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  type AuthProject
} from "../../../config/projects";
import { isEnabledAuthFeaturePath } from "../http";

const project: AuthProject = {
  slug: "demo",
  name: "Demo App",
  schema: "demo_auth",
  description: "",
  iconUrl: "",
  appUrl: "",
  trustedOrigins: ["https://demo.example.com"],
  features: DEFAULT_PROJECT_FEATURES,
  socialProviders: DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  billing: DEFAULT_PROJECT_BILLING,
  storage: DEFAULT_PROJECT_STORAGE
};

describe("auth route feature gates", () => {
  test("blocks public sign-up in the built-in admin realm", () => {
    expect(
      isEnabledAuthFeaturePath(
        ADMIN_PROJECT,
        "/api/admin/auth/sign-up/email"
      )
    ).toBe(false);
  });

  test("keeps sign-up available for regular realms", () => {
    expect(
      isEnabledAuthFeaturePath(
        project,
        "/api/demo/auth/sign-up/email"
      )
    ).toBe(true);
  });

  test("keeps disabled feature endpoints closed", () => {
    expect(
      isEnabledAuthFeaturePath(
        project,
        "/api/demo/auth/passkey/verify-authentication"
      )
    ).toBe(false);
    expect(
      isEnabledAuthFeaturePath(
        project,
        "/api/demo/auth/oauth2/authorize"
      )
    ).toBe(false);
    expect(
      isEnabledAuthFeaturePath(
        project,
        "/api/demo/auth/checkout"
      )
    ).toBe(false);
  });
});
