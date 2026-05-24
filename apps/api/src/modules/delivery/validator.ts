import { EmailProvider, type EmailConfig } from "../../email/sender";
import { isEnumValue } from "../../runtime/enums";

export type DeliverySettingsPatch = {
  provider: EmailConfig["provider"];
  from: string;
  cloudflareAccountId: string;
  cloudflareApiToken?: string;
  resendApiKey?: string;
};

type DeliverySettingsBody = Partial<Record<keyof DeliverySettingsPatch, unknown>>;

export const parseDeliverySettingsPatch = (body: DeliverySettingsBody) => {
  if (
    typeof body.provider !== "string" ||
    !isEnumValue(EmailProvider, body.provider) ||
    typeof body.from !== "string" ||
    typeof body.cloudflareAccountId !== "string"
  ) {
    return null;
  }

  const patch: DeliverySettingsPatch = {
    provider: body.provider,
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
};

export const validateDeliverySettingsPatch = (patch: DeliverySettingsPatch) => {
  if (
    !isEnumValue(EmailProvider, patch.provider)
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
};
