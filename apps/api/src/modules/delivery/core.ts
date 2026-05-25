import type { AuthRegistry } from "../../auth/registry";
import type { AuthProject } from "../../config/projects";
import type { AdminDatabase } from "../../db/admin-pool";
import { createEmailSender, type EmailConfig } from "../../email/sender";
import {
  deliverySettingsResponse,
  toRuntimeEmailConfig,
  type PublicDeliverySettings
} from "./translator";
import {
  readDeliverySettings,
  updateDeliverySettings
} from "./store";
import {
  validateDeliverySettingsPatch,
  type DeliverySettingsPatch
} from "./validator";

type DeliveryAdminSession = {
  user: {
    email: string;
  };
};

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
      adminDb?: AdminDatabase;
      encryptionSecret: string;
      setDeliverySettings(settings: EmailConfig): void;
    }
  ) {}

  async readSettings() {
    const settings = await readDeliverySettings({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject,
      adminDb: this.options.adminDb,
      encryptionSecret: this.options.encryptionSecret
    });

    return deliverySettingsResponse(settings);
  }

  async updateSettings(patch: DeliverySettingsPatch) {
    validateDeliverySettingsPatch(patch);
    const settings = await updateDeliverySettings({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject,
      adminDb: this.options.adminDb,
      encryptionSecret: this.options.encryptionSecret,
      patch
    });
    const deliverySettings = toRuntimeEmailConfig(settings);

    this.options.setDeliverySettings(deliverySettings);
    await this.options.registry.updateEmailSender(createEmailSender(deliverySettings));

    return deliverySettingsResponse(settings);
  }

  async verify(admin: DeliveryAdminSession) {
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
      adminDb: this.options.adminDb,
      encryptionSecret: this.options.encryptionSecret
    });

    return toRuntimeEmailConfig(settings);
  }
}
