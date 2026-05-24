import { describe, expect, test } from "bun:test";

import { DEFAULT_PROJECT_FEATURES, DEFAULT_PROJECT_STORAGE } from "../src/config/projects";
import { cloneDefaultSocialProviders } from "../src/db/social-provider-settings";
import { projectResponse } from "../src/http/translate/project";
import { parseMediaUploadRequest } from "../src/http/validator/storage";

describe("storage HTTP layers", () => {
  test("accepts only the expected media upload purpose and a file", async () => {
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });
    const form = new FormData();
    form.set("purpose", "user_avatar");
    form.set("file", file);

    await expect(parseMediaUploadRequest(form, "user_avatar")).resolves.toEqual({
      purpose: "user_avatar",
      file
    });
    await expect(parseMediaUploadRequest(form, "project_icon")).resolves.toBeNull();
  });

  test("rejects media upload forms without a file", async () => {
    const form = new FormData();
    form.set("purpose", "user_avatar");

    await expect(parseMediaUploadRequest(form, "user_avatar")).resolves.toBeNull();
  });
});

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
