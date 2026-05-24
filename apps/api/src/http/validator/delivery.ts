import type { DeliverySettingsPatch } from "../../db/delivery-settings";

type DeliverySettingsBody = Partial<Record<keyof DeliverySettingsPatch, unknown>>;

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
