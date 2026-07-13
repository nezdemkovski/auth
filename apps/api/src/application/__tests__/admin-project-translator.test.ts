import { describe, expect, test } from "bun:test";
import { DEFAULT_PROJECT_STORAGE } from "@nezdemkovski/auth-storage";
import {
  BillingEnvironment,
  BillingProvider
} from "@nezdemkovski/auth-billing";
import {
  cloneDefaultSocialProviders,
  DEFAULT_REALM_FEATURES,
  SocialProvider
} from "@nezdemkovski/auth-realm";

import { adminProjectResponse } from "../admin-project-translator";

describe("admin project aggregate translator", () => {
  test("combines realm and identity state without exposing provider secrets", () => {
    const socialProviders = cloneDefaultSocialProviders();
    socialProviders[SocialProvider.GitHub] = {
      ...socialProviders[SocialProvider.GitHub],
      enabled: true,
      clientId: "github-client",
      clientSecret: "github-secret",
      verifiedAt: "2026-05-24T00:00:00.000Z"
    };

    const response = adminProjectResponse(
      {
        slug: "demo",
        schema: "demo_auth",
        name: "Demo App",
        description: "Collaborative maps",
        iconUrl: "https://example.test/icon.png",
        appUrl: "https://demo.example.com",
        trustedOrigins: ["https://demo.example.com"],
        features: DEFAULT_REALM_FEATURES,
        socialProviders,
        billing: {
          provider: BillingProvider.None,
          enabled: false,
          environment: BillingEnvironment.Sandbox,
          accessToken: "",
          organizationId: "",
          webhookSecret: "",
          products: [],
          freeEntitlements: []
        },
        storage: DEFAULT_PROJECT_STORAGE
      },
      { userCount: 1, activeSessionCount: 2 },
      "https://auth.example.com"
    );

    const github = response.socialProviders.find(
      (provider) => provider.provider === SocialProvider.GitHub
    );

    expect(response.userCount).toBe(1);
    expect(response.activeSessionCount).toBe(2);
    expect(github).toEqual({
      provider: SocialProvider.GitHub,
      enabled: true,
      clientId: "github-client",
      configured: true,
      verifiedAt: "2026-05-24T00:00:00.000Z",
      callbackUrl:
        "https://auth.example.com/api/demo/auth/callback/github"
    });
    expect(JSON.stringify(response)).not.toContain("github-secret");
  });
});
