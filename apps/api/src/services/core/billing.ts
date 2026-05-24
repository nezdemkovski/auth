import { Polar } from "@polar-sh/sdk";
import type { PresentmentCurrency } from "@polar-sh/sdk/models/components/presentmentcurrency";

import type { AuthRegistry, RegisteredProject } from "../../auth/registry";
import type { AuthProject } from "../../config/projects";
import {
  readPublicBillingSettings,
  updateBillingSettings,
  type BillingSettingsPatch
} from "../../db/billing-settings";
import type { CreatePolarProductInput } from "../../http/validator/billing";

export type BillingServiceOptions = {
  registry: AuthRegistry;
  databaseUrl: string;
  adminProject: AuthProject;
  publicBaseUrl: string;
  encryptionSecret: string;
};

export class BillingServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400
  ) {
    super(message);
    this.name = "BillingServiceError";
  }
}

export class BillingService {
  constructor(private readonly options: BillingServiceOptions) {}

  readSettings(project: AuthProject) {
    return readPublicBillingSettings({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject,
      project,
      publicBaseUrl: this.options.publicBaseUrl
    });
  }

  async updateSettings(
    registered: RegisteredProject,
    patch: BillingSettingsPatch
  ) {
    const billing = await updateBillingSettings({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject,
      project: registered.project,
      encryptionSecret: this.options.encryptionSecret,
      patch
    });
    await this.options.registry.updateProject({
      ...registered.project,
      billing
    });

    return this.readSettings(registered.project);
  }

  async verifyPolar(
    project: AuthProject,
    input: {
      accessToken?: unknown;
      environment?: unknown;
    }
  ): Promise<void> {
    const billing = project.billing;
    const accessToken =
      typeof input.accessToken === "string" && input.accessToken.trim()
        ? input.accessToken.trim()
        : billing.accessToken;
    const environment =
      input.environment === "production" || input.environment === "sandbox"
        ? input.environment
        : billing.environment;
    if (!accessToken) {
      throw new BillingServiceError(
        "billing_not_configured",
        "Billing is not configured",
        409
      );
    }

    const client = new Polar({
      accessToken,
      server: environment
    });
    try {
      await client.products.list({ limit: 1 });
    } catch (error) {
      throw new BillingServiceError(
        "polar_check_failed",
        polarErrorMessage(error, "Polar check failed")
      );
    }
  }

  async listPolarProducts(project: AuthProject) {
    const client = createPolarClient(project);
    if (!client) {
      throw new BillingServiceError(
        "billing_not_configured",
        "Enable Polar billing and save an access token before loading products",
        409
      );
    }

    try {
      const page = await client.products.list({
        isArchived: false,
        limit: 50
      });

      return page.result.items.map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description ?? "",
        isRecurring: product.isRecurring,
        isArchived: product.isArchived,
        organizationId: product.organizationId
      }));
    } catch (error) {
      throw new BillingServiceError(
        "polar_products_failed",
        polarErrorMessage(error, "Could not load Polar products")
      );
    }
  }

  async createPolarProduct(project: AuthProject, input: CreatePolarProductInput) {
    const client = createPolarClient(project);
    if (!client) {
      throw new BillingServiceError(
        "billing_not_configured",
        "Enable Polar billing and save an access token before creating products",
        409
      );
    }

    try {
      const product = await client.products.create({
        name: input.name,
        description: input.description || null,
        visibility: "private",
        prices: [
          {
            amountType: "fixed",
            priceAmount: input.priceAmount,
            priceCurrency: input.priceCurrency as PresentmentCurrency
          }
        ],
        ...(input.type === "subscription"
          ? {
              recurringInterval: input.recurringInterval,
              recurringIntervalCount: 1
            }
          : {
              recurringInterval: null,
              recurringIntervalCount: null
            })
      });

      return {
        slug: input.slug,
        name: product.name,
        description: product.description ?? "",
        productId: product.id,
        type: input.type,
        active: true,
        entitlements: defaultEntitlementsForBillingProduct(input.type)
      };
    } catch (error) {
      throw new BillingServiceError(
        "polar_product_create_failed",
        polarErrorMessage(error, "Could not create Polar product")
      );
    }
  }
}

function createPolarClient(project: AuthProject): Polar | null {
  const billing = project.billing;
  if (billing.provider !== "polar" || !billing.enabled || !billing.accessToken) {
    return null;
  }

  return new Polar({
    accessToken: billing.accessToken,
    server: billing.environment
  });
}

function defaultEntitlementsForBillingProduct(
  type: "subscription" | "one_time" | "credit_pack" | "lifetime"
): BillingSettingsPatch["products"][number]["entitlements"] {
  if (type === "subscription") {
    return [
      {
        key: "ai_requests",
        grantType: "recurring_quota",
        amount: 100,
        resetPeriod: "monthly",
        priority: 100
      }
    ];
  }
  if (type === "credit_pack") {
    return [
      {
        key: "ai_request_credits",
        grantType: "one_time_credits",
        amount: 100,
        resetPeriod: "never",
        priority: 100
      }
    ];
  }

  return [
    {
      key: "access",
      grantType: type === "lifetime" ? "lifetime" : "boolean",
      amount: null,
      resetPeriod: "never",
      priority: 100
    }
  ];
}

function polarErrorMessage(error: unknown, fallback: string): string {
  if (isRecord(error)) {
    const body = typeof error.body === "string" ? error.body : "";
    const statusCode = typeof error.statusCode === "number" ? error.statusCode : null;
    const parsed = parsePolarErrorBody(body);
    if (parsed) {
      return statusCode ? `Polar ${statusCode}: ${parsed}` : parsed;
    }
    if (error.message && typeof error.message === "string") {
      return statusCode ? `Polar ${statusCode}: ${error.message}` : error.message;
    }
  }

  return error instanceof Error ? error.message : fallback;
}

function parsePolarErrorBody(body: string): string | null {
  if (!body) {
    return null;
  }

  try {
    const data = JSON.parse(body) as unknown;
    if (!isRecord(data)) {
      return body.slice(0, 300);
    }
    if (typeof data.detail === "string") {
      return data.detail;
    }
    if (Array.isArray(data.detail)) {
      return data.detail
        .map((item) => {
          if (!isRecord(item)) {
            return null;
          }
          const location = Array.isArray(item.loc) ? item.loc.join(".") : "";
          const message = typeof item.msg === "string" ? item.msg : null;
          return message ? [location, message].filter(Boolean).join(": ") : null;
        })
        .filter((item): item is string => Boolean(item))
        .join("; ");
    }
    if (typeof data.message === "string") {
      return data.message;
    }
    return JSON.stringify(data).slice(0, 300);
  } catch {
    return body.slice(0, 300);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
