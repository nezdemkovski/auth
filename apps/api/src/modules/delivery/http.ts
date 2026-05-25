import {
  auditLog,
  domainErrorResponse,
  parseJson,
  requireAdmin,
  type AdminRouteRegistration
} from "../../http/admin/shared";
import { DeliveryServiceError } from "./core";
import { parseDeliverySettingsPatch } from "./validator";

export const registerDeliveryRoutes: AdminRouteRegistration = ({
  app,
  options,
  deliveryService
}) => {
  app.get("/delivery-settings", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    return c.json({
      settings: await deliveryService.readSettings()
    });
  });

  app.patch("/delivery-settings", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const body = await parseJson(c.req);
    const patch = parseDeliverySettingsPatch(body);
    if (!patch) {
      return c.json({ error: "invalid_body" }, 400);
    }

    try {
      const settings = await deliveryService.updateSettings(patch);
      auditLog("delivery.settings.updated", {
        actorId: admin.session.user.id,
        actorEmail: admin.session.user.email
      });
      return c.json({ settings });
    } catch (error) {
      return c.json(
        {
          error: "invalid_delivery_settings",
          message: error instanceof Error ? error.message : "Invalid delivery settings"
        },
        400
      );
    }
  });

  app.post("/delivery-settings/verify", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    try {
      await deliveryService.verify(admin.session);
      auditLog("delivery.settings.verified", {
        actorId: admin.session.user.id,
        actorEmail: admin.session.user.email
      });
    } catch (error) {
      if (error instanceof DeliveryServiceError) {
        return domainErrorResponse(error);
      }
      throw error;
    }

    return c.json({ ok: true });
  });
};
