import { EmailProvider, type EmailConfig } from "../../email/sender";

export type DeliverySettingsPatch = {
  provider: EmailConfig["provider"];
  from: string;
  cloudflareAccountId: string;
  cloudflareApiToken?: string;
  resendApiKey?: string;
};

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

export function validateDeliverySettingsPatch(patch: DeliverySettingsPatch): void {
  if (
    patch.provider !== EmailProvider.None &&
    patch.provider !== EmailProvider.Resend &&
    patch.provider !== EmailProvider.Cloudflare
  ) {
    throw new Error("Invalid delivery provider");
  }

  if (patch.from.trim().length > 200) {
    throw new Error("From address is too long");
  }

  if (patch.provider !== EmailProvider.None && !patch.from.trim()) {
    throw new Error("From address is required");
  }

  if (
    patch.provider === EmailProvider.Cloudflare &&
    !patch.cloudflareAccountId.trim()
  ) {
    throw new Error("Cloudflare account ID is required");
  }
}
