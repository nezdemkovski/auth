import { describe, expect, test } from "bun:test";

import {
  ADMIN_PROJECT,
  DEFAULT_PROJECT_SOCIAL_PROVIDERS
} from "../../../config/projects";
import {
  isSocialProviderId,
  SOCIAL_PROVIDER_CATALOG,
  SOCIAL_PROVIDER_IDS,
  SocialProvider
} from "../../../config/social-providers";
import {
  __socialProviderTestUtils,
  cloneDefaultSocialProviders,
  socialProviderCallbackUrl
} from "../social-provider-store";

describe("social provider settings", () => {
  test("catalog and default settings stay in sync", () => {
    expect(Object.keys(SOCIAL_PROVIDER_CATALOG).sort()).toEqual(
      [...SOCIAL_PROVIDER_IDS].sort()
    );
    expect(Object.keys(DEFAULT_PROJECT_SOCIAL_PROVIDERS).sort()).toEqual(
      [...SOCIAL_PROVIDER_IDS].sort()
    );
  });

  test("validates known provider identifiers", () => {
    expect(isSocialProviderId(SocialProvider.GitHub)).toBe(true);
    expect(isSocialProviderId("linkedin")).toBe(false);
  });

  test("clones default provider settings without sharing nested objects", () => {
    const first = cloneDefaultSocialProviders();
    const second = cloneDefaultSocialProviders();

    first[SocialProvider.GitHub].enabled = true;

    expect(second[SocialProvider.GitHub].enabled).toBe(false);
  });

  test("encrypts secrets with authenticated encryption and rejects tampering", () => {
    const secret = "x".repeat(32);
    const cipher = __socialProviderTestUtils.encryptSecret(
      "client-secret",
      secret,
      "openmarkers",
      SocialProvider.GitHub
    );

    expect(cipher).toMatch(/^v1:/);
    expect(cipher).not.toContain("client-secret");
    expect(
      __socialProviderTestUtils.decryptSecret(
        cipher,
        secret,
        "openmarkers",
        SocialProvider.GitHub
      )
    ).toBe("client-secret");
    expect(() =>
      __socialProviderTestUtils.decryptSecret(
        cipher,
        "y".repeat(32),
        "openmarkers",
        SocialProvider.GitHub
      )
    ).toThrow();
    expect(() =>
      __socialProviderTestUtils.decryptSecret(
        cipher,
        secret,
        "other",
        SocialProvider.GitHub
      )
    ).toThrow();
    expect(() =>
      __socialProviderTestUtils.decryptSecret(
        cipher,
        secret,
        "openmarkers",
        SocialProvider.Google
      )
    ).toThrow();
  });

  test("builds provider callback URLs under the realm auth endpoint", () => {
    expect(
      socialProviderCallbackUrl(
        "https://auth.example.com",
        ADMIN_PROJECT,
        SocialProvider.GitHub
      )
    ).toBe("https://auth.example.com/api/admin/auth/callback/github");
  });
});
