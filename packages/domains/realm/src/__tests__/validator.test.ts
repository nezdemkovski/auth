import { describe, expect, test } from "bun:test";

import {
  DEFAULT_REALM_FEATURES,
  RealmAgentAuthMode,
  RealmTwoFactorRequirement
} from "../model";
import {
  normalizeRealmFeatures,
  validateRealmSettingsPatch
} from "../validator";

describe("realm validator", () => {
  test("rejects invalid realm settings", () => {
    const patch = {
      name: "Demo App",
      description: "",
      iconUrl: "",
      appUrl: "https://demo.example.com",
      trustedOrigins: ["https://demo.example.com"],
      features: DEFAULT_REALM_FEATURES
    };

    expect(() =>
      validateRealmSettingsPatch({
        ...patch,
        name: " "
      })
    ).toThrow("Project name is required");
    expect(() =>
      validateRealmSettingsPatch({
        ...patch,
        appUrl: "javascript:alert(1)"
      })
    ).toThrow("Invalid appUrl");
    expect(() =>
      validateRealmSettingsPatch({
        ...patch,
        trustedOrigins: ["https://demo.example.com/path"]
      })
    ).toThrow("Invalid trusted origin");
    expect(() =>
      validateRealmSettingsPatch({
        ...patch,
        trustedOrigins: ["https://demo.example.com", "https://demo.example.com"]
      })
    ).toThrow("Duplicate trusted origin");
  });

  test("normalizes realm feature policy", () => {
    expect(
      normalizeRealmFeatures({
        passkey: { enabled: true },
        twoFactor: {
          enabled: true,
          required: RealmTwoFactorRequirement.Everyone
        },
        agentAuth: { enabled: true, mode: RealmAgentAuthMode.ScopedWrite },
        oauthProvider: { enabled: true, dynamicClientRegistration: true }
      })
    ).toEqual({
      passkey: { enabled: true },
      twoFactor: {
        enabled: true,
        required: RealmTwoFactorRequirement.Everyone
      },
      agentAuth: { enabled: true, mode: RealmAgentAuthMode.ScopedWrite },
      oauthProvider: { enabled: true, dynamicClientRegistration: true }
    });
  });

  test("fails closed for invalid realm feature values", () => {
    expect(
      normalizeRealmFeatures({
        passkey: { enabled: "yes" },
        twoFactor: { enabled: true, required: "root" },
        agentAuth: { enabled: true, mode: "god-mode" },
        oauthProvider: { enabled: "yes", dynamicClientRegistration: "sure" }
      })
    ).toEqual({
      passkey: { enabled: false },
      twoFactor: {
        enabled: true,
        required: RealmTwoFactorRequirement.Optional
      },
      agentAuth: { enabled: true, mode: RealmAgentAuthMode.ReadOnly },
      oauthProvider: { enabled: false, dynamicClientRegistration: false }
    });
  });

  test("keeps dynamic registration behind OAuth provider enablement", () => {
    expect(
      normalizeRealmFeatures({
        oauthProvider: { enabled: false, dynamicClientRegistration: true }
      }).oauthProvider
    ).toEqual({
      enabled: false,
      dynamicClientRegistration: false
    });
  });
});
