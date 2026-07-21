import { describe, expect, test } from "bun:test";
import {
  BillingEnvironment,
  BillingProductType,
  BillingProvider,
  DEFAULT_PROJECT_BILLING
} from "@nezdemkovski/auth-billing";
import {
  DEFAULT_REALM_FEATURES,
  DEFAULT_REALM_SOCIAL_PROVIDERS
} from "@nezdemkovski/auth-realm";
import { DEFAULT_PROJECT_STORAGE } from "@nezdemkovski/auth-storage";

import type { AuthProject } from "../../../config/projects";
import {
  BillingCustomerError,
  BillingCustomerErrorCode,
  BillingCustomerService,
  type BillingCustomerGateway
} from "../core";

const project: AuthProject = {
  slug: "demo",
  name: "Demo App",
  schema: "demo_auth",
  description: "",
  iconUrl: "",
  appUrl: "https://demo.example.com",
  trustedOrigins: ["https://demo.example.com"],
  features: DEFAULT_REALM_FEATURES,
  socialProviders: DEFAULT_REALM_SOCIAL_PROVIDERS,
  billing: {
    ...DEFAULT_PROJECT_BILLING,
    provider: BillingProvider.Polar,
    enabled: true,
    environment: BillingEnvironment.Sandbox,
    accessToken: "polar-token",
    products: [
      {
        slug: "pro-monthly",
        name: "Pro",
        description: "",
        productId: "polar-product",
        type: BillingProductType.Subscription,
        active: true,
        entitlements: []
      }
    ]
  },
  storage: DEFAULT_PROJECT_STORAGE
};

describe("billing customer service", () => {
  test("creates checkout for the authenticated Better Auth subject", async () => {
    let subject = "";
    let productId = "";
    const gateway: BillingCustomerGateway = {
      createCheckout: async (input) => {
        subject = input.subject;
        productId = input.productId;
        return "https://checkout.example/session";
      },
      createPortal: async () => "https://checkout.example/portal"
    };
    const service = new BillingCustomerService(gateway);

    expect(
      await service.createCheckout(project, "user-1", "pro-monthly")
    ).toBe("https://checkout.example/session");
    expect({ subject, productId }).toEqual({
      subject: "user-1",
      productId: "polar-product"
    });
  });

  test("rejects a product that is not enabled for the realm", async () => {
    const service = new BillingCustomerService({
      createCheckout: async () => "",
      createPortal: async () => ""
    });

    try {
      await service.createCheckout(project, "user-1", "unknown");
      throw new Error("Expected checkout to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(BillingCustomerError);
      if (error instanceof BillingCustomerError) {
        expect(error.code).toBe(BillingCustomerErrorCode.ProductNotFound);
      }
    }
  });
});
