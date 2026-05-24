import type { AuthRegistry } from "../../auth/registry";
import type { AuthProject } from "../../config/projects";
import { createEmailSender, type EmailConfig } from "../../email/sender";
import type { AdminSession } from "../../http/admin/shared";
import {
  loadDeliverySettings,
  readPublicDeliverySettings,
  updateDeliverySettings,
  type DeliverySettingsPatch,
  type PublicDeliverySettings
} from "./store";

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

  async readSettings(): Promise<PublicDeliverySettings> {
    return readPublicDeliverySettings({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject
    });
  }

  async updateSettings(patch: DeliverySettingsPatch): Promise<PublicDeliverySettings> {
    const settings = await updateDeliverySettings({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject,
      encryptionSecret: this.options.encryptionSecret,
      patch
    });
    const deliverySettings = await this.loadRuntimeSettings();

    this.options.setDeliverySettings(deliverySettings);
    await this.options.registry.updateEmailSender(createEmailSender(deliverySettings));

    return settings;
  }

  async verify(admin: AdminSession): Promise<void> {
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

  private async loadRuntimeSettings(): Promise<EmailConfig> {
    return loadDeliverySettings({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject,
      encryptionSecret: this.options.encryptionSecret
    });
  }
}
