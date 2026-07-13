import { describe, expect, test } from "bun:test";
import { Polar } from "@polar-sh/sdk";

import {
  BillingEnvironment,
  BillingProductType,
  BillingProvider,
  BillingRecurringInterval,
  type BillingRealm
} from "../model";
import {
  BillingService,
  type BillingPolarGateway
} from "../core";

const project: BillingRealm = {
  slug: "demo",
  billing: {
    provider: BillingProvider.Polar,
    enabled: true,
    environment: BillingEnvironment.Sandbox,
    organizationId: "",
    accessToken: "polar-token",
    webhookSecret: "",
    products: [],
    freeEntitlements: []
  }
};

const createService = (polar: BillingPolarGateway = createPolarGateway().gateway) => {
  return new BillingService({
    databaseUrl: "postgres://auth:auth@127.0.0.1:5432/auth",
    adminProject: { schema: "auth_admin" },
    publicBaseUrl: "https://auth.example.com",
    encryptionSecret: "x".repeat(32),
    applyRuntimeSettings: async () => {},
    polar
  });
};

const createPolarGateway = () => {
  const createdProducts: string[] = [];
  const client = new Polar({
    accessToken: "polar-token",
    server: BillingEnvironment.Sandbox
  });

  return {
    createdProducts,
    gateway: {
      verifyAccess: async () => {},
      createClient: () => client,
      listProducts: async () => [
        {
          id: "prod_existing",
          name: "Existing product",
          description: "Already in Polar",
          isRecurring: false,
          isArchived: false,
          organizationId: "org_123"
        }
      ],
      createProduct: async (_client: Polar, input: { name: string }) => {
        createdProducts.push(input.name);
        return {
          id: "prod_created",
          name: input.name,
          description: "50 AI requests",
          isRecurring: false,
          isArchived: false,
          organizationId: "org_123"
        };
      }
    }
  };
};

describe("billing service", () => {
  test("refuses Polar product operations until billing has a configured client", async () => {
    const service = createService({
      verifyAccess: async () => {},
      createClient: () => null,
      listProducts: async () => [],
      createProduct: async () => {
        throw new Error("should not create");
      }
    });

    await expect(
      service.createPolarProduct(project, {
        slug: "ai-pack",
        name: "50 AI requests",
        description: "One-time credit pack",
        type: BillingProductType.CreditPack,
        priceAmount: 1000,
        priceCurrency: "eur",
        recurringInterval: BillingRecurringInterval.Month
      })
    ).rejects.toMatchObject({
      code: "billing_not_configured",
      status: 409
    });
  });

  test("creates a local product mapping without platform-specific benefits", async () => {
    const { gateway, createdProducts } = createPolarGateway();
    const service = createService(gateway);

    await expect(
      service.createPolarProduct(project, {
        slug: "ai-pack",
        name: "50 AI requests",
        description: "One-time credit pack",
        type: BillingProductType.CreditPack,
        priceAmount: 1000,
        priceCurrency: "eur",
        recurringInterval: BillingRecurringInterval.Month
      })
    ).resolves.toMatchObject({
      slug: "ai-pack",
      productId: "prod_created",
      name: "50 AI requests",
      active: true,
      entitlements: []
    });
    expect(createdProducts).toEqual(["50 AI requests"]);
  });

  test("maps Polar gateway failures to stable service errors", async () => {
    const service = createService({
      verifyAccess: async () => {
        throw {
          statusCode: 401,
          body: JSON.stringify({
            error_description: "Token is invalid"
          })
        };
      },
      createClient: () => null,
      listProducts: async () => [],
      createProduct: async () => {
        throw new Error("should not create");
      }
    });

    await expect(
      service.verifyPolar(project, {
        accessToken: "bad-token",
        environment: BillingEnvironment.Sandbox
      })
    ).rejects.toMatchObject({
      code: "polar_check_failed",
      message: "Polar 401: Token is invalid"
    });
  });
});
