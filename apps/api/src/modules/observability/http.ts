import {
  auditLog,
  domainErrorResponse,
  parseJson,
  requireAdmin,
  type AdminRouteRegistration
} from "../../http/admin/shared";
import {
  ObservabilityServiceError
} from "./core";
import { parseObservabilitySettingsPatch } from "./validator";

export const registerObservabilityRoutes: AdminRouteRegistration = ({
  app,
  options,
  observabilityService
}) => {
  app.get("/observability-config", (c) => {
    return c.json({
      observability: observabilityService.publicConfig()
    });
  });

  app.get("/observability-settings", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    return c.json({
      settings: await observabilityService.readSettings()
    });
  });

  app.patch("/observability-settings", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const patch = parseObservabilitySettingsPatch(await parseJson(c.req));
    if (!patch) {
      return c.json({ error: "invalid_body" }, 400);
    }

    try {
      const settings = await observabilityService.updateSettings(patch);
      auditLog("observability.settings.updated", {
        actorId: admin.session.user.id,
        actorEmail: admin.session.user.email
      });
      return c.json({ settings });
    } catch (error) {
      return observabilityServiceError(error);
    }
  });

  app.post("/observability-settings/test", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    try {
      await observabilityService.sendTestEvent();
      auditLog("observability.test_event.sent", {
        actorId: admin.session.user.id,
        actorEmail: admin.session.user.email
      });
      return c.json({ ok: true });
    } catch (error) {
      return observabilityServiceError(error);
    }
  });
};

const observabilityServiceError = (error: unknown) => {
  if (error instanceof ObservabilityServiceError) {
    return domainErrorResponse(error);
  }

  throw error;
};
