import { Polar } from "@polar-sh/sdk";
import type { PresentmentCurrency } from "@polar-sh/sdk/models/components/presentmentcurrency";

import {
  loadProjectBillingSettings,
  readPublicBillingSettings,
  updateBillingSettings,
  type BillingSettingsPatch
} from "../../../db/billing-settings";
import {
  parseBillingSettingsPatch,
  parseCreatePolarProduct
} from "../../validator/billing";
import {
  isRecord,
  requireAdmin,
  type AdminRouteRegistration
} from "../shared";

type BillingVerifyBody = {
  accessToken?: unknown;
  environment?: unknown;
};

export const registerBillingRoutes: AdminRouteRegistration = ({ app, options }) => {
  app.get("/projects/:project/billing", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const registered = options.registry.get(c.req.param("project"));
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }

    return c.json({
      settings: await readPublicBillingSettings({
        databaseUrl: options.databaseUrl,
        adminProject: options.adminProject,
        project: registered.project,
        publicBaseUrl: options.publicBaseUrl
      })
    });
  });

  app.patch("/projects/:project/billing", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const registered = options.registry.get(c.req.param("project"));
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }
    if (registered.project.slug === options.adminProject.slug) {
      return c.json({ error: "system_project_locked" }, 409);
    }

    const body = await c.req.json().catch(() => ({}));
    const patch = parseBillingSettingsPatch(body);
    if (!patch) {
      return c.json({ error: "invalid_body" }, 400);
    }

    try {
      const billing = await updateBillingSettings({
        databaseUrl: options.databaseUrl,
        adminProject: options.adminProject,
        project: registered.project,
        encryptionSecret: options.secret,
        patch
      });
      await options.registry.updateProject({
        ...registered.project,
        billing
      });

      return c.json({
        settings: await readPublicBillingSettings({
          databaseUrl: options.databaseUrl,
          adminProject: options.adminProject,
          project: registered.project,
          publicBaseUrl: options.publicBaseUrl
        })
      });
    } catch (error) {
      return c.json(
        {
          error: "invalid_billing_settings",
          message: error instanceof Error ? error.message : "Invalid billing settings"
        },
        400
      );
    }
  });

  app.post("/projects/:project/billing/verify", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const registered = options.registry.get(c.req.param("project"));
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }

    const body = (await c.req.json().catch(() => ({}))) as BillingVerifyBody;
    const billing = registered.project.billing;
    const accessToken =
      typeof body.accessToken === "string" && body.accessToken.trim()
        ? body.accessToken.trim()
        : billing.accessToken;
    const environment =
      body.environment === "production" || body.environment === "sandbox"
        ? body.environment
        : billing.environment;
    if (!accessToken) {
      return c.json({ error: "billing_not_configured" }, 409);
    }

    const client = new Polar({
      accessToken,
      server: environment
    });
    try {
      await client.products.list({
        limit: 1
      });
    } catch (error) {
      return c.json(
        {
          error: "polar_check_failed",
          message: polarErrorMessage(error, "Polar check failed")
        },
        400
      );
    }

    return c.json({ ok: true });
  });

  app.get("/projects/:project/billing/polar-products", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const registered = options.registry.get(c.req.param("project"));
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }

    const client = createPolarClient(registered.project);
    if (!client) {
      return c.json(
        {
          error: "billing_not_configured",
          message: "Enable Polar billing and save an access token before loading products"
        },
        409
      );
    }

    try {
      const page = await client.products.list({
        isArchived: false,
        limit: 50
      });

      return c.json({
        products: page.result.items.map((product) => ({
          id: product.id,
          name: product.name,
          description: product.description ?? "",
          isRecurring: product.isRecurring,
          isArchived: product.isArchived,
          organizationId: product.organizationId
        }))
      });
    } catch (error) {
      return c.json(
        {
          error: "polar_products_failed",
          message: polarErrorMessage(error, "Could not load Polar products")
        },
        400
      );
    }
  });

  app.post("/projects/:project/billing/polar-products", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const registered = options.registry.get(c.req.param("project"));
    if (!registered) {
      return c.json({ error: "unknown_project" }, 404);
    }
    if (registered.project.slug === options.adminProject.slug) {
      return c.json({ error: "system_project_locked" }, 409);
    }

    const client = createPolarClient(registered.project);
    if (!client) {
      return c.json(
        {
          error: "billing_not_configured",
          message: "Enable Polar billing and save an access token before creating products"
        },
        409
      );
    }

    const body = await c.req.json().catch(() => ({}));
    const input = parseCreatePolarProduct(body);
    if (!input) {
      return c.json({ error: "invalid_body" }, 400);
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

      return c.json(
        {
          product: {
            slug: input.slug,
            name: product.name,
            description: product.description ?? "",
            productId: product.id,
            type: input.type,
            active: true,
            entitlements: defaultEntitlementsForBillingProduct(input.type)
          }
        },
        201
      );
    } catch (error) {
      return c.json(
        {
          error: "polar_product_create_failed",
          message: polarErrorMessage(error, "Could not create Polar product")
        },
        400
      );
    }
  });
};

function createPolarClient(project: { billing: BillingSettingsPatch }): Polar | null {
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
