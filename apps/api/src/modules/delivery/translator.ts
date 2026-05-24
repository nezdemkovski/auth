import { EmailProvider, type EmailConfig } from "../../email/sender";

export type PublicDeliverySettings = {
  provider: EmailConfig["provider"];
  from: string;
  cloudflareAccountId: string;
  cloudflareApiTokenConfigured: boolean;
  resendApiKeyConfigured: boolean;
  configured: boolean;
  updatedAt: string | null;
};

export type DeliverySettingsResponseRow = {
  provider: string;
  fromAddress: string;
  cloudflareAccountId: string;
  cloudflareApiTokenCipher: string;
  resendApiKeyCipher: string;
  updatedAt: Date | string;
};

export function deliverySettingsResponse(
  row: DeliverySettingsResponseRow | null
): PublicDeliverySettings {
  if (!row) {
    return {
      provider: EmailProvider.None,
      from: "",
      cloudflareAccountId: "",
      cloudflareApiTokenConfigured: false,
      resendApiKeyConfigured: false,
      configured: false,
      updatedAt: null
    };
  }

  const provider = isDeliveryProvider(row.provider) ? row.provider : EmailProvider.None;
  const resendApiKeyConfigured = Boolean(row.resendApiKeyCipher);
  const cloudflareApiTokenConfigured = Boolean(row.cloudflareApiTokenCipher);
  return {
    provider,
    from: row.fromAddress,
    cloudflareAccountId: row.cloudflareAccountId,
    resendApiKeyConfigured,
    cloudflareApiTokenConfigured,
    configured:
      provider === EmailProvider.Resend
        ? Boolean(row.fromAddress && resendApiKeyConfigured)
        : provider === EmailProvider.Cloudflare
        ? Boolean(row.fromAddress && row.cloudflareAccountId && cloudflareApiTokenConfigured)
        : false,
    updatedAt: normalizeDate(row.updatedAt)
  };
}

function isDeliveryProvider(value: string): value is EmailConfig["provider"] {
  return (
    value === EmailProvider.None ||
    value === EmailProvider.Resend ||
    value === EmailProvider.Cloudflare
  );
}

function normalizeDate(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
