import type { AuthRegistry, RegisteredProject } from "../../auth/registry";
import type { AuthProject } from "../../config/projects";
import { defaultEntitlementsForBillingProduct } from "./entitlements";
import {
  createPolarClientFromProject,
  createPolarProduct,
  listPolarProducts,
  polarErrorMessage,
  verifyPolarAccess
} from "./polar-client";
import {
  readBillingSettingsState,
  updateBillingSettings
} from "./store";
import {
  billingSettingsResponse,
  createdBillingProductResponse,
  polarProductResponse
} from "./translator";
import {
  validateBillingSettingsPatch,
  type BillingSettingsPatch,
  type CreatePolarProductInput
} from "./validator";

export type BillingServiceOptions = {
  registry: AuthRegistry;
  databaseUrl: string;
  adminProject: AuthProject;
  publicBaseUrl: string;
  encryptionSecret: string;
};

export class BillingServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400
  ) {
    super(message);
    this.name = "BillingServiceError";
  }
}

export class BillingService {
  constructor(private readonly options: BillingServiceOptions) {}

  async readSettings(project: AuthProject) {
    const settings = await readBillingSettingsState({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject,
      project
    });

    return billingSettingsResponse({
      settings,
      project,
      publicBaseUrl: this.options.publicBaseUrl
    });
  }

  async updateSettings(
    registered: RegisteredProject,
    patch: BillingSettingsPatch
  ) {
    validateBillingSettingsPatch(patch);
    const billing = await updateBillingSettings({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject,
      project: registered.project,
      encryptionSecret: this.options.encryptionSecret,
      patch
    });
    await this.options.registry.updateProject({
      ...registered.project,
      billing
    });

    return this.readSettings(registered.project);
  }

  async verifyPolar(
    project: AuthProject,
    input: {
      accessToken?: unknown;
      environment?: unknown;
    }
  ): Promise<void> {
    const billing = project.billing;
    const accessToken =
      typeof input.accessToken === "string" && input.accessToken.trim()
        ? input.accessToken.trim()
        : billing.accessToken;
    const environment =
      input.environment === "production" || input.environment === "sandbox"
        ? input.environment
        : billing.environment;
    if (!accessToken) {
      throw new BillingServiceError(
        "billing_not_configured",
        "Billing is not configured",
        409
      );
    }

    try {
      await verifyPolarAccess({ accessToken, environment });
    } catch (error) {
      throw new BillingServiceError(
        "polar_check_failed",
        polarErrorMessage(error, "Polar check failed")
      );
    }
  }

  async listPolarProducts(project: AuthProject) {
    const client = createPolarClientFromProject(project);
    if (!client) {
      throw new BillingServiceError(
        "billing_not_configured",
        "Enable Polar billing and save an access token before loading products",
        409
      );
    }

    try {
      const products = await listPolarProducts(client);
      return products.map(polarProductResponse);
    } catch (error) {
      throw new BillingServiceError(
        "polar_products_failed",
        polarErrorMessage(error, "Could not load Polar products")
      );
    }
  }

  async createPolarProduct(project: AuthProject, input: CreatePolarProductInput) {
    const client = createPolarClientFromProject(project);
    if (!client) {
      throw new BillingServiceError(
        "billing_not_configured",
        "Enable Polar billing and save an access token before creating products",
        409
      );
    }

    try {
      const product = await createPolarProduct(client, input);
      return createdBillingProductResponse(
        product,
        input,
        defaultEntitlementsForBillingProduct(input.type)
      );
    } catch (error) {
      throw new BillingServiceError(
        "polar_product_create_failed",
        polarErrorMessage(error, "Could not create Polar product")
      );
    }
  }
}
