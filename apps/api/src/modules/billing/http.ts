import {
  BillingServiceError,
  parseBillingSettingsPatch,
  parseCreatePolarProduct
} from "@nezdemkovski/auth-billing";
import {
  auditLog,
  domainErrorResponse,
  parseJson,
  requireAdmin,
  requireMutableProject,
  requireRegisteredProject,
  type AdminRouteRegistration
} from "../../http/admin/shared";
import { ErrorCode } from "../../runtime/error-codes";

export const registerBillingRoutes: AdminRouteRegistration = ({
  app,
  options,
  billingService
}) => {
  app.get("/projects/:project/billing", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: ErrorCode.Unauthorized }, 401);
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
      return c.json({ error: ErrorCode.Unauthorized }, 401);
    }

    const project = requireMutableProject(options, c.req.param("project"));
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }

    const patch = parseBillingSettingsPatch(await parseJson(c.req));
    if (!patch) {
      return c.json({ error: ErrorCode.InvalidBody }, 400);
    }

    try {
      const settings = await billingService.updateSettings(
        project.registered.project,
        patch
      );
      auditLog("billing.settings.updated", {
        actorId: admin.session.user.id,
        actorEmail: admin.session.user.email,
        projectSlug: project.registered.project.slug
      });
      return c.json({
        settings
      });
    } catch (error) {
      return domainErrorResponse(
        new BillingServiceError(
          "invalid_billing_settings",
          error instanceof Error ? error.message : "Invalid billing settings",
          400
        )
      );
    }
  });

  app.post("/projects/:project/billing/verify", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: ErrorCode.Unauthorized }, 401);
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
      return c.json({ error: ErrorCode.Unauthorized }, 401);
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
      return c.json({ error: ErrorCode.Unauthorized }, 401);
    }

    const project = requireMutableProject(options, c.req.param("project"));
    if (project.error) {
      return c.json({ error: project.error }, project.status);
    }

    const input = parseCreatePolarProduct(await parseJson(c.req));
    if (!input) {
      return c.json({ error: ErrorCode.InvalidBody }, 400);
    }

    try {
      const product = await billingService.createPolarProduct(
        project.registered.project,
        input
      );
      auditLog("billing.product.created", {
        actorId: admin.session.user.id,
        actorEmail: admin.session.user.email,
        projectSlug: project.registered.project.slug
      });
      return c.json({ product }, 201);
    } catch (error) {
      return billingServiceError(error);
    }
  });
};

const billingServiceError = (error: unknown) => {
  if (error instanceof BillingServiceError) {
    return domainErrorResponse(error);
  }

  throw error;
};
