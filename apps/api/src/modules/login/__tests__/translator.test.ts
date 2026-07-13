import { describe, expect, test } from "bun:test";
import { DEFAULT_PROJECT_STORAGE } from "@nezdemkovski/auth-storage";
import { DEFAULT_PROJECT_BILLING } from "@nezdemkovski/auth-billing";
import {
  DEFAULT_REALM_FEATURES,
  DEFAULT_REALM_SOCIAL_PROVIDERS,
  SocialProvider
} from "@nezdemkovski/auth-realm";
import {
  LoginMode,
  LoginNextAction,
  loginConfigResponse,
  loginNextActionResponse,
  oauthConsentConfigResponse
} from "../translator";

describe("login translator", () => {
  test("exposes only enabled and configured social providers", () => {
    const response = loginConfigResponse({
      project: "demo",
      mode: LoginMode.Login,
      observability: {
        enabled: false,
        dsn: "",
        environment: "test"
      },
      registered: {
        project: {
          slug: "demo",
          name: "Demo App",
          schema: "demo_auth",
          description: "",
          iconUrl: "",
          appUrl: "",
          trustedOrigins: [],
          features: DEFAULT_REALM_FEATURES,
          billing: DEFAULT_PROJECT_BILLING,
          storage: DEFAULT_PROJECT_STORAGE,
          socialProviders: {
            [SocialProvider.Telegram]: {
              enabled: true,
              clientId: "demo_bot",
              clientSecret: "telegram-bot-token",
              verifiedAt: null
            },
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

    expect(response.socialProviders).toEqual([
      {
        id: SocialProvider.Telegram,
        label: "Telegram",
        shortLabel: "Telegram"
      },
      {
        id: SocialProvider.GitHub,
        label: "GitHub",
        shortLabel: "GitHub"
      }
    ]);
  });

  test("describes oauth scopes on the server", () => {
    const response = oauthConsentConfigResponse({
      project: "demo",
      clientId: "client",
      scopes: ["openid", "custom:write"],
      observability: {
        enabled: false,
        dsn: "",
        environment: "test"
      },
      registered: {
        project: {
          slug: "demo",
          name: "Demo App",
          schema: "demo_auth",
          description: "",
          iconUrl: "",
          appUrl: "",
          trustedOrigins: [],
          features: DEFAULT_REALM_FEATURES,
          billing: DEFAULT_PROJECT_BILLING,
          storage: DEFAULT_PROJECT_STORAGE,
          socialProviders: DEFAULT_REALM_SOCIAL_PROVIDERS
        }
      }
    });

    expect(response.scopeDescriptions.openid.title).toBe("Sign you in");
    expect(response.scopeDescriptions["custom:write"]).toEqual({
      title: "custom:write",
      description: "Access this application-specific permission."
    });
  });

  test("returns server-owned post-login actions", () => {
    expect(
      loginNextActionResponse({
        project: {
          features: {
            ...DEFAULT_REALM_FEATURES,
            passkey: { enabled: true }
          }
        },
        user: { twoFactorEnabled: true },
        hasPasskeys: false
      })
    ).toEqual({ action: LoginNextAction.OfferPasskey });
  });
});
