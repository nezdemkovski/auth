import { describe, expect, test } from "bun:test";
import { Polar } from "@polar-sh/sdk";

import {
  BillingEnvironment,
  BillingProductType,
  BillingProvider,
  BillingRecurringInterval,
  DEFAULT_PROJECT_FEATURES,
  DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  DEFAULT_PROJECT_STORAGE,
  type AuthProject
} from "../../../config/projects";
import {
  BillingService,
  type BillingPolarGateway
} from "../core";

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
  billing: {
    provider: BillingProvider.Polar,
    enabled: true,
    environment: BillingEnvironment.Sandbox,
    organizationId: "",
    accessToken: "polar-token",
    webhookSecret: "",
    products: [],
    freeEntitlements: []
  },
  storage: DEFAULT_PROJECT_STORAGE
};

const createService = (polar: BillingPolarGateway = createPolarGateway().gateway) => {
  return new BillingService({
    registry: {
      updateProject: async () => {}
    },
    databaseUrl: "postgres://auth:auth@127.0.0.1:5432/auth",
    adminProject: project,
    publicBaseUrl: "https://auth.example.com",
    encryptionSecret: "x".repeat(32),
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
      createClientFromProject: () => client,
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
      createClientFromProject: () => null,
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
      createClientFromProject: () => null,
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
