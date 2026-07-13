import {
  DeliveryServiceError,
  parseDeliverySettingsPatch
} from "@nezdemkovski/auth-delivery";

import {
  auditLog,
  domainErrorResponse,
  parseJson,
  requireAdmin,
  type AdminRouteRegistration
} from "../../http/admin/shared";
import { ErrorCode } from "../../runtime/error-codes";

export const registerDeliveryRoutes: AdminRouteRegistration = ({
  app,
  options,
  deliveryService
}) => {
  app.get("/delivery-settings", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: ErrorCode.Unauthorized }, 401);
    }

    return c.json({
      settings: await deliveryService.readSettings()
    });
  });

  app.patch("/delivery-settings", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: ErrorCode.Unauthorized }, 401);
    }

    const body = await parseJson(c.req);
    const patch = parseDeliverySettingsPatch(body);
    if (!patch) {
      return c.json({ error: ErrorCode.InvalidBody }, 400);
    }

    try {
      const settings = await deliveryService.updateSettings(patch);
      auditLog("delivery.settings.updated", {
        actorId: admin.session.user.id,
        actorEmail: admin.session.user.email
      });
      return c.json({ settings });
    } catch (error) {
      return domainErrorResponse(
        new DeliveryServiceError(
          "invalid_delivery_settings",
          400,
          error instanceof Error ? error.message : "Invalid delivery settings"
        )
      );
    }
  });

  app.post("/delivery-settings/verify", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: ErrorCode.Unauthorized }, 401);
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
