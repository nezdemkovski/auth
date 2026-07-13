import { describe, expect, test } from "bun:test";

import {
  cloneDefaultSocialProviders,
  DEFAULT_REALM_SOCIAL_PROVIDERS
} from "../model";
import {
  decryptSocialProviderSecret,
  encryptSocialProviderSecret
} from "../social-provider-store";
import {
  isSocialProviderId,
  SOCIAL_PROVIDER_CATALOG,
  SOCIAL_PROVIDER_IDS,
  SocialProvider
} from "../social-providers";

describe("realm social providers", () => {
  test("keeps provider catalog and default settings in sync", () => {
    expect(Object.keys(SOCIAL_PROVIDER_CATALOG).sort()).toEqual(
      [...SOCIAL_PROVIDER_IDS].sort()
    );
    expect(Object.keys(DEFAULT_REALM_SOCIAL_PROVIDERS).sort()).toEqual(
      [...SOCIAL_PROVIDER_IDS].sort()
    );
  });

  test("validates known provider identifiers", () => {
    expect(isSocialProviderId(SocialProvider.GitHub)).toBe(true);
    expect(isSocialProviderId("linkedin")).toBe(false);
  });

  test("clones defaults without sharing nested objects", () => {
    const first = cloneDefaultSocialProviders();
    const second = cloneDefaultSocialProviders();

    first[SocialProvider.GitHub].enabled = true;

    expect(second[SocialProvider.GitHub].enabled).toBe(false);
  });

  test("encrypts secrets with realm and provider context", async () => {
    const secret = "x".repeat(32);
    const cipher = await encryptSocialProviderSecret(
      "client-secret",
      secret,
      "demo",
      SocialProvider.GitHub
    );

    expect(cipher).toMatch(/^v1:/);
    expect(cipher).not.toContain("client-secret");
    expect(
      await decryptSocialProviderSecret(
        cipher,
        secret,
        "demo",
        SocialProvider.GitHub
      )
    ).toBe("client-secret");
    await expect(
      decryptSocialProviderSecret(
        cipher,
        "y".repeat(32),
        "demo",
        SocialProvider.GitHub
      )
    ).rejects.toThrow();
    await expect(
      decryptSocialProviderSecret(
        cipher,
        secret,
        "other",
        SocialProvider.GitHub
      )
    ).rejects.toThrow();
    await expect(
      decryptSocialProviderSecret(
        cipher,
        secret,
        "demo",
        SocialProvider.Google
      )
    ).rejects.toThrow();
  });
});
