import type {
  AdminDatabase,
  AdminSchema
} from "@nezdemkovski/auth-platform-database";

import {
  createEmailSender,
  type EmailConfig,
  type EmailSender
} from "./sender";
import {
  deliverySettingsResponse,
  toRuntimeEmailConfig
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
      databaseUrl: string;
      adminProject: AdminSchema;
      adminDb?: AdminDatabase;
      encryptionSecret: string;
      applyRuntimeSettings(
        settings: EmailConfig,
        sender: EmailSender | null
      ): Promise<void>;
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

    await this.options.applyRuntimeSettings(
      deliverySettings,
      createEmailSender(deliverySettings)
    );

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
