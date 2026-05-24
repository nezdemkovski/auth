import { BillingServiceError } from "./core";
import {
  parseBillingSettingsPatch,
  parseCreatePolarProduct
} from "./validator";
import { requireAdmin, type AdminRouteRegistration } from "../../http/admin/shared";

export const registerBillingRoutes: AdminRouteRegistration = ({
  app,
  options,
  billingService
}) => {
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
      settings: await billingService.readSettings(registered.project)
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

    const patch = parseBillingSettingsPatch(await c.req.json().catch(() => ({})));
    if (!patch) {
      return c.json({ error: "invalid_body" }, 400);
    }

    try {
      return c.json({
        settings: await billingService.updateSettings(registered, patch)
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

    try {
      await billingService.verifyPolar(
        registered.project,
        await c.req.json().catch(() => ({}))
      );
      return c.json({ ok: true });
    } catch (error) {
      return billingServiceError(error);
    }
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

    try {
      return c.json({
        products: await billingService.listPolarProducts(registered.project)
      });
    } catch (error) {
      return billingServiceError(error);
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

    const input = parseCreatePolarProduct(await c.req.json().catch(() => ({})));
    if (!input) {
      return c.json({ error: "invalid_body" }, 400);
    }

    try {
      return c.json(
        {
          product: await billingService.createPolarProduct(registered.project, input)
        },
        201
      );
    } catch (error) {
      return billingServiceError(error);
    }
  });
};

function billingServiceError(error: unknown): Response {
  if (error instanceof BillingServiceError) {
    return Response.json(
      {
        error: error.code,
        message: error.message
      },
      { status: error.status }
    );
  }

  throw error;
}
