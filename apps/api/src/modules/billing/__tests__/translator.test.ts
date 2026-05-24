import { describe, expect, test } from "bun:test";

import {
  BillingEnvironment,
  BillingProvider,
  DEFAULT_PROJECT_BILLING,
  DEFAULT_PROJECT_FEATURES,
  DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  DEFAULT_PROJECT_STORAGE
} from "../../../config/projects";
import { billingSettingsResponse } from "../translator";

describe("billing translator", () => {
  test("builds public billing settings without secrets", () => {
    expect(
      billingSettingsResponse({
        publicBaseUrl: "https://auth.example.com",
        project: {
          slug: "openmarkers",
          schema: "openmarkers_auth",
          name: "OpenMarkers",
          description: "",
          iconUrl: "",
          appUrl: "",
          trustedOrigins: [],
          features: DEFAULT_PROJECT_FEATURES,
          billing: DEFAULT_PROJECT_BILLING,
          socialProviders: DEFAULT_PROJECT_SOCIAL_PROVIDERS,
          storage: DEFAULT_PROJECT_STORAGE
        },
        settings: {
          provider: BillingProvider.Polar,
          enabled: true,
          environment: BillingEnvironment.Sandbox,
          organizationId: "",
          accessTokenConfigured: true,
          webhookSecretConfigured: false,
          products: []
        }
      })
    ).toEqual({
      provider: BillingProvider.Polar,
      enabled: true,
      environment: BillingEnvironment.Sandbox,
      organizationId: "",
      accessTokenConfigured: true,
      webhookSecretConfigured: false,
      products: [],
      webhookUrl: "https://auth.example.com/api/openmarkers/auth/polar/webhooks"
    });
  });
});
