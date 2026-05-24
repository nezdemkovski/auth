import { EmailProvider, type EmailConfig } from "../../email/sender";
import type { DeliverySettings } from "./store";

export type PublicDeliverySettings = {
  provider: EmailConfig["provider"];
  from: string;
  cloudflareAccountId: string;
  cloudflareApiTokenConfigured: boolean;
  resendApiKeyConfigured: boolean;
  configured: boolean;
  updatedAt: string | null;
};

export const deliverySettingsResponse = (settings: DeliverySettings) => {
  return {
    provider: settings.provider,
    from: settings.from,
    cloudflareAccountId: settings.cloudflareAccountId,
    resendApiKeyConfigured: settings.resendApiKeyConfigured,
    cloudflareApiTokenConfigured: settings.cloudflareApiTokenConfigured,
    configured: isDeliveryConfigured(settings),
    updatedAt: settings.updatedAt
  };
};

export const isDeliveryConfigured = (settings: DeliverySettings) => {
  if (settings.provider === EmailProvider.Resend) {
    return Boolean(settings.from && settings.resendApiKey);
  }

  if (settings.provider === EmailProvider.Cloudflare) {
    return Boolean(
      settings.from && settings.cloudflareAccountId && settings.cloudflareApiToken
    );
  }

  return false;
};
