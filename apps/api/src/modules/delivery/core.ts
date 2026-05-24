import type { AuthRegistry } from "../../auth/registry";
import type { AuthProject } from "../../config/projects";
import { createEmailSender, EmailProvider, type EmailConfig } from "../../email/sender";
import type { AdminSession } from "../../http/admin/shared";
import {
  deliverySettingsResponse,
  type PublicDeliverySettings
} from "./translator";
import {
  readDeliverySettings,
  updateDeliverySettings
} from "./store";
import type { DeliverySettings } from "./store";
import {
  validateDeliverySettingsPatch,
  type DeliverySettingsPatch
} from "./validator";

export class DeliveryServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: 400 | 409,
    message: string
  ) {
    super(message);
  }
}

export class DeliveryService {
  constructor(
    private readonly options: {
      registry: AuthRegistry;
      databaseUrl: string;
      adminProject: AuthProject;
      encryptionSecret: string;
      setDeliverySettings(settings: EmailConfig): void;
    }
  ) {}

  async readSettings() {
    const settings = await readDeliverySettings({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject,
      encryptionSecret: this.options.encryptionSecret
    });

    return deliverySettingsResponse(settings);
  }

  async updateSettings(patch: DeliverySettingsPatch) {
    validateDeliverySettingsPatch(patch);
    const settings = await updateDeliverySettings({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject,
      encryptionSecret: this.options.encryptionSecret,
      patch
    });
    const deliverySettings = toRuntimeEmailConfig(settings);

    this.options.setDeliverySettings(deliverySettings);
    await this.options.registry.updateEmailSender(createEmailSender(deliverySettings));

    return deliverySettingsResponse(settings);
  }

  async verify(admin: AdminSession) {
    const settings = await this.loadRuntimeSettings();
    const sender = createEmailSender(settings);
    if (!sender) {
      throw new DeliveryServiceError(
        "delivery_not_configured",
        409,
        "Delivery is not configured"
      );
    }

    await sender.send({
      to: admin.user.email,
      subject: "Auth delivery test",
      html: "<p>Delivery settings are working.</p>",
      text: "Delivery settings are working."
    });
  }

  private async loadRuntimeSettings() {
    const settings = await readDeliverySettings({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject,
      encryptionSecret: this.options.encryptionSecret
    });

    return toRuntimeEmailConfig(settings);
  }
}

export const toRuntimeEmailConfig = (settings: DeliverySettings) => {
  if (
    settings.provider === EmailProvider.Resend &&
    settings.from &&
    settings.resendApiKey
  ) {
    const config: EmailConfig = {
      provider: EmailProvider.Resend,
      from: settings.from,
      apiKey: settings.resendApiKey
    };

    return config;
  }

  if (
    settings.provider === EmailProvider.Cloudflare &&
    settings.from &&
    settings.cloudflareAccountId &&
    settings.cloudflareApiToken
  ) {
    const config: EmailConfig = {
      provider: EmailProvider.Cloudflare,
      from: settings.from,
      accountId: settings.cloudflareAccountId,
      apiToken: settings.cloudflareApiToken
    };

    return config;
  }

  const config: EmailConfig = {
    provider: EmailProvider.None
  };

  return config;
};
