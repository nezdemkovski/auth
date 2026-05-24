import { describe, expect, test } from "bun:test";

import { DEFAULT_PROJECT_FEATURES, DEFAULT_PROJECT_STORAGE } from "../../../config/projects";
import { cloneDefaultSocialProviders } from "../social-provider-store";
import { projectResponse } from "../translator";

describe("project translator", () => {
  test("serializes realm metadata without exposing provider secrets", () => {
    const socialProviders = cloneDefaultSocialProviders();
    socialProviders.github = {
      ...socialProviders.github,
      enabled: true,
      clientId: "github-client",
      clientSecret: "github-secret",
      verifiedAt: "2026-05-24T00:00:00.000Z"
    };

    const response = projectResponse(
      {
        slug: "openmarkers",
        schema: "openmarkers_auth",
        name: "OpenMarkers",
        description: "Collaborative maps",
        iconUrl: "https://example.test/icon.png",
        appUrl: "https://openmarkers.app",
        trustedOrigins: ["https://openmarkers.app"],
        features: DEFAULT_PROJECT_FEATURES,
        socialProviders,
        billing: {
          provider: "none",
          enabled: false,
          environment: "sandbox",
          accessToken: "",
          organizationId: "",
          webhookSecret: "",
          products: []
        },
        storage: DEFAULT_PROJECT_STORAGE
      },
      { userCount: 1, activeSessionCount: 2 },
      "https://auth.nezdemkovski.cloud"
    );

    const github = response.socialProviders.find(
      (provider) => provider.provider === "github"
    );

    expect(response.userCount).toBe(1);
    expect(response.activeSessionCount).toBe(2);
    expect(github).toEqual({
      provider: "github",
      enabled: true,
      clientId: "github-client",
      configured: true,
      verifiedAt: "2026-05-24T00:00:00.000Z",
      callbackUrl:
        "https://auth.nezdemkovski.cloud/api/openmarkers/auth/callback/github"
    });
    expect(JSON.stringify(response)).not.toContain("github-secret");
  });
});
