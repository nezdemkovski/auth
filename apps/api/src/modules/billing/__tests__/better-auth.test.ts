import { describe, expect, test } from "bun:test";
import {
  BillingEnvironment,
  BillingProvider,
  DEFAULT_PROJECT_BILLING,
  type PolarEntitlementGrantStore,
  type PolarWebhookStore
} from "@nezdemkovski/auth-billing";
import { DEFAULT_PROJECT_STORAGE } from "@nezdemkovski/auth-storage";

import {
  DEFAULT_PROJECT_FEATURES,
  DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  type AuthProject
} from "../../../config/projects";
import { createBillingAuthPluginContribution } from "../better-auth";

const project: AuthProject = {
  slug: "demo",
  name: "Demo App",
  schema: "demo_auth",
  description: "",
  iconUrl: "",
  appUrl: "https://demo.example.com",
  trustedOrigins: ["https://demo.example.com"],
  features: DEFAULT_PROJECT_FEATURES,
  socialProviders: DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  billing: DEFAULT_PROJECT_BILLING,
  storage: DEFAULT_PROJECT_STORAGE
};

const webhookStore: PolarWebhookStore = {
  withResourceLock: async (_input, operation) => operation(),
  claimEvent: async () => true,
  claimResourceVersion: async () => true,
  releaseResourceVersion: async () => {},
  completeEvent: async () => {},
  failEvent: async () => {},
  upsertOrder: async () => {},
  upsertCustomerState: async () => {},
  upsertBenefitGrant: async () => {},
  upsertSubscription: async () => {},
  close: async () => {}
};

const entitlementStore: PolarEntitlementGrantStore = {
  grantProductEntitlements: async () => 0,
  deactivateSource: async () => 0,
  deactivateSubscription: async () => 0
};

describe("billing Better Auth contribution", () => {
  test("contributes Polar only for enabled realms with an access token", () => {
    const contribute = createBillingAuthPluginContribution({
      entitlements: entitlementStore,
      webhooks: webhookStore
    });

    expect(contribute(project)).toEqual([]);
    expect(
      contribute({
        ...project,
        billing: {
          ...DEFAULT_PROJECT_BILLING,
          provider: BillingProvider.Polar,
          enabled: true,
          environment: BillingEnvironment.Sandbox,
          accessToken: "polar-token"
        }
      }).map((plugin) => plugin.id)
    ).toEqual(["polar"]);
  });
});
