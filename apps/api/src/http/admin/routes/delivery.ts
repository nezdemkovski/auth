import {
  loadDeliverySettings,
  readPublicDeliverySettings,
  updateDeliverySettings,
  type DeliverySettingsPatch
} from "../../../db/delivery-settings";
import { createEmailSender } from "../../../email/sender";
import { requireAdmin, type AdminRouteRegistration } from "../shared";

type DeliverySettingsBody = Partial<Record<keyof DeliverySettingsPatch, unknown>>;

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

    const body = (await c.req.json().catch(() => ({}))) as DeliverySettingsBody;
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

export function parseDeliverySettingsPatch(
  body: DeliverySettingsBody
): DeliverySettingsPatch | null {
  if (
    typeof body.provider !== "string" ||
    typeof body.from !== "string" ||
    typeof body.cloudflareAccountId !== "string"
  ) {
    return null;
  }

  const patch: DeliverySettingsPatch = {
    provider: body.provider as DeliverySettingsPatch["provider"],
    from: body.from.trim(),
    cloudflareAccountId: body.cloudflareAccountId.trim()
  };

  if (typeof body.cloudflareApiToken === "string" && body.cloudflareApiToken.trim()) {
    patch.cloudflareApiToken = body.cloudflareApiToken.trim();
  }
  if (typeof body.resendApiKey === "string" && body.resendApiKey.trim()) {
    patch.resendApiKey = body.resendApiKey.trim();
  }

  return patch;
}
