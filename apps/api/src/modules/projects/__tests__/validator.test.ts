import { describe, expect, test } from "bun:test";
import {
  RealmAgentAuthMode,
  RealmTwoFactorRequirement
} from "@nezdemkovski/auth-realm";

import { parseProjectCreate } from "../validator";

describe("project creation validator", () => {
  test("derives a ready-to-use realm from the three onboarding fields", () => {
    expect(
      parseProjectCreate({
        slug: "demo",
        name: "Demo App",
        appUrl: "https://demo.example.com/",
        backendUrl: "https://api.demo.example.com"
      })
    ).toEqual({
      realm: {
        slug: "demo",
        name: "Demo App",
        description: "",
        iconUrl: "",
        appUrl: "https://demo.example.com",
        trustedOrigins: ["https://demo.example.com"],
        features: {
          passkey: { enabled: false },
          twoFactor: {
            enabled: false,
            required: RealmTwoFactorRequirement.Optional
          },
          agentAuth: {
            enabled: false,
            mode: RealmAgentAuthMode.ReadOnly
          },
          oauthProvider: {
            enabled: true,
            dynamicClientRegistration: false
          }
        }
      },
      backendUrl: "https://api.demo.example.com"
    });
  });

  test("rejects URLs that are not application origins", () => {
    expect(
      parseProjectCreate({
        slug: "demo",
        name: "Demo App",
        appUrl: "https://demo.example.com/path",
        backendUrl: "https://api.demo.example.com"
      })
    ).toBeNull();
    expect(
      parseProjectCreate({
        slug: "demo",
        name: "Demo App",
        appUrl: "https://demo.example.com",
        backendUrl: "https://user:secret@api.demo.example.com"
      })
    ).toBeNull();
  });
});
