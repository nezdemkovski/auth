import {
  loadDeliverySettings,
  readPublicDeliverySettings,
  updateDeliverySettings
} from "../../../db/delivery-settings";
import { createEmailSender } from "../../../email/sender";
import { parseDeliverySettingsPatch } from "../../validator/delivery";
import { requireAdmin, type AdminRouteRegistration } from "../shared";

export const registerDeliveryRoutes: AdminRouteRegistration = ({
  app,
  options,
  setDeliverySettings
}) => {
  app.get("/delivery-settings", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    return c.json({
      settings: await readPublicDeliverySettings({
        databaseUrl: options.databaseUrl,
        adminProject: options.adminProject
      })
    });
  });

  app.patch("/delivery-settings", async (c) => {
    const admin = await requireAdmin(options.registry, c.req.raw.headers);
    if (!admin) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const body = await c.req.json().catch(() => ({}));
    const patch = parseDeliverySettingsPatch(body);
    if (!patch) {
      return c.json({ error: "invalid_body" }, 400);
    }

    try {
      const settings = await updateDeliverySettings({
        databaseUrl: options.databaseUrl,
        adminProject: options.adminProject,
        encryptionSecret: options.secret,
        patch
      });
      const deliverySettings = await loadDeliverySettings({
        databaseUrl: options.databaseUrl,
        adminProject: options.adminProject,
        encryptionSecret: options.secret
      });
      setDeliverySettings(deliverySettings);
      await options.registry.updateEmailSender(createEmailSender(deliverySettings));

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

    const settings = await loadDeliverySettings({
      databaseUrl: options.databaseUrl,
      adminProject: options.adminProject,
      encryptionSecret: options.secret
    });
    const sender = createEmailSender(settings);
    if (!sender) {
      return c.json({ error: "delivery_not_configured" }, 409);
    }

    await sender.send({
      to: admin.session.user.email,
      subject: "Auth delivery test",
      html: "<p>Delivery settings are working.</p>",
      text: "Delivery settings are working."
    });

    return c.json({ ok: true });
  });
};
