import { BillingServiceError } from "./core";
import {
  parseBillingSettingsPatch,
  parseCreatePolarProduct
} from "./validator";
import {
  parseJson,
  requireAdmin,
  requireMutableProject,
  requireRegisteredProject,
  type AdminRouteRegistration
} from "../../http/admin/shared";

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

    const project = requireRegisteredProject(options, c.req.param("project"));
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }

    return c.json({
      settings: await billingService.readSettings(project.registered.project)
    });
  });

  app.patch("/projects/:project/billing", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const project = requireMutableProject(options, c.req.param("project"));
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }

    const patch = parseBillingSettingsPatch(await parseJson(c.req));
    if (!patch) {
      return c.json({ error: "invalid_body" }, 400);
    }

    try {
      return c.json({
        settings: await billingService.updateSettings(project.registered, patch)
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

    const project = requireRegisteredProject(options, c.req.param("project"));
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }

    try {
      await billingService.verifyPolar(
        project.registered.project,
        await parseJson(c.req)
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

    const project = requireRegisteredProject(options, c.req.param("project"));
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }

    try {
      return c.json({
        products: await billingService.listPolarProducts(project.registered.project)
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

    const project = requireMutableProject(options, c.req.param("project"));
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }

    const input = parseCreatePolarProduct(await parseJson(c.req));
    if (!input) {
      return c.json({ error: "invalid_body" }, 400);
    }

    try {
      return c.json(
        {
          product: await billingService.createPolarProduct(project.registered.project, input)
        },
        201
      );
    } catch (error) {
      return billingServiceError(error);
    }
  });
};

const billingServiceError = (error: unknown) => {
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
};
