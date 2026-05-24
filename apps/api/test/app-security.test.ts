import { describe, expect, test } from "bun:test";

import {
  ADMIN_PROJECT,
  DEFAULT_PROJECT_BILLING,
  DEFAULT_PROJECT_FEATURES,
  DEFAULT_PROJECT_STORAGE,
  DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  type AuthProject
} from "../src/config/projects";
import { __appTestUtils } from "../src/http/app";

const project: AuthProject = {
  slug: "openmarkers",
  name: "OpenMarkers",
  schema: "openmarkers_auth",
  description: "",
  iconUrl: "",
  appUrl: "",
  trustedOrigins: ["https://openmarkers.app"],
  features: DEFAULT_PROJECT_FEATURES,
  socialProviders: DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  billing: DEFAULT_PROJECT_BILLING,
  storage: DEFAULT_PROJECT_STORAGE
};

describe("auth route feature gates", () => {
  test("blocks public sign-up in the built-in admin realm", () => {
    expect(
      __appTestUtils.isEnabledAuthFeaturePath(
        ADMIN_PROJECT,
        "/api/admin/auth/sign-up/email"
      )
    ).toBe(false);
  });

  test("keeps sign-up available for regular realms", () => {
    expect(
      __appTestUtils.isEnabledAuthFeaturePath(
        project,
        "/api/openmarkers/auth/sign-up/email"
      )
    ).toBe(true);
  });

  test("keeps disabled feature endpoints closed", () => {
    expect(
      __appTestUtils.isEnabledAuthFeaturePath(
        project,
        "/api/openmarkers/auth/passkey/verify-authentication"
      )
    ).toBe(false);
    expect(
      __appTestUtils.isEnabledAuthFeaturePath(
        project,
        "/api/openmarkers/auth/oauth2/authorize"
      )
    ).toBe(false);
    expect(
      __appTestUtils.isEnabledAuthFeaturePath(
        project,
        "/api/openmarkers/auth/checkout"
      )
    ).toBe(false);
  });
});
