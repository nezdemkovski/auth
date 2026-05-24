import { describe, expect, test } from "bun:test";

import {
  DEFAULT_PROJECT_BILLING,
  DEFAULT_PROJECT_FEATURES,
  DEFAULT_PROJECT_STORAGE
} from "../../../config/projects";
import { SocialProvider } from "../../../config/social-providers";
import { LoginMode, loginConfigResponse } from "../translator";

describe("login translator", () => {
  test("exposes only enabled and configured social providers", () => {
    const response = loginConfigResponse({
      project: "openmarkers",
      redirectUri: "https://openmarkers.app/auth/callback",
      state: "state",
      mode: LoginMode.Login,
      codeChallenge: "A".repeat(43),
      registered: {
        project: {
          slug: "openmarkers",
          name: "OpenMarkers",
          schema: "openmarkers_auth",
          description: "",
          iconUrl: "",
          appUrl: "",
          trustedOrigins: [],
          features: DEFAULT_PROJECT_FEATURES,
          billing: DEFAULT_PROJECT_BILLING,
          storage: DEFAULT_PROJECT_STORAGE,
          socialProviders: {
            [SocialProvider.GitHub]: {
              enabled: true,
              clientId: "github-client",
              clientSecret: "github-secret",
              verifiedAt: null
            },
            [SocialProvider.Google]: {
              enabled: true,
              clientId: "",
              clientSecret: "google-secret",
              verifiedAt: null
            },
            [SocialProvider.Facebook]: {
              enabled: false,
              clientId: "facebook-client",
              clientSecret: "facebook-secret",
              verifiedAt: null
            },
            [SocialProvider.Twitter]: {
              enabled: true,
              clientId: "twitter-client",
              clientSecret: "",
              verifiedAt: null
            }
          }
        }
      }
    });

    expect(response.socialProviders).toEqual([SocialProvider.GitHub]);
  });
});
