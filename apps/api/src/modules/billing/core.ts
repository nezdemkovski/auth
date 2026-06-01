import type { AuthRegistry, RegisteredProject } from "../../auth/registry";
import type { AuthProject } from "../../config/projects";
import type { AdminDatabase } from "../../db/admin-pool";
import { BillingEnvironment } from "../../config/projects";
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
  polarProductResponse,
  type PolarProductSummary
} from "./translator";
import {
  validateBillingSettingsPatch,
  type BillingSettingsPatch,
  type CreatePolarProductInput
} from "./validator";

export type BillingServiceOptions = {
  registry: Pick<AuthRegistry, "updateProject">;
  databaseUrl: string;
  adminProject: AuthProject;
  adminDb?: AdminDatabase;
  publicBaseUrl: string;
  encryptionSecret: string;
  polar?: BillingPolarGateway;
};

export type BillingPolarGateway = {
  verifyAccess: typeof verifyPolarAccess;
  createClientFromProject(project: AuthProject): NonNullable<ReturnType<typeof createPolarClientFromProject>> | null;
  listProducts(client: NonNullable<ReturnType<typeof createPolarClientFromProject>>): Promise<PolarProductSummary[]>;
  createProduct(
    client: NonNullable<ReturnType<typeof createPolarClientFromProject>>,
    input: CreatePolarProductInput
  ): Promise<PolarProductSummary>;
};

const defaultPolarGateway: BillingPolarGateway = {
  verifyAccess: verifyPolarAccess,
  createClientFromProject: createPolarClientFromProject,
  listProducts: listPolarProducts,
  createProduct: createPolarProduct
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
  constructor(private readonly options: BillingServiceOptions) {
    this.polar = options.polar ?? defaultPolarGateway;
  }

  private readonly polar: BillingPolarGateway;

  async readSettings(project: AuthProject) {
    const settings = await readBillingSettingsState({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject,
      adminDb: this.options.adminDb,
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
      adminDb: this.options.adminDb,
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
  ) {
    const billing = project.billing;
    const accessToken =
      typeof input.accessToken === "string" && input.accessToken.trim()
        ? input.accessToken.trim()
        : billing.accessToken;
    const environment =
      input.environment === BillingEnvironment.Production ||
      input.environment === BillingEnvironment.Sandbox
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
      await this.polar.verifyAccess({ accessToken, environment });
    } catch (error) {
      throw new BillingServiceError(
        "polar_check_failed",
        polarErrorMessage(error, "Polar check failed")
      );
    }
  }

  async listPolarProducts(project: AuthProject) {
    const client = this.polar.createClientFromProject(project);
    if (!client) {
      throw new BillingServiceError(
        "billing_not_configured",
        "Enable Polar billing and save an access token before loading products",
        409
      );
    }

    try {
      const products = await this.polar.listProducts(client);
      return products.map(polarProductResponse);
    } catch (error) {
      throw new BillingServiceError(
        "polar_products_failed",
        polarErrorMessage(error, "Could not load Polar products")
      );
    }
  }

  async createPolarProduct(project: AuthProject, input: CreatePolarProductInput) {
    const client = this.polar.createClientFromProject(project);
    if (!client) {
      throw new BillingServiceError(
        "billing_not_configured",
        "Enable Polar billing and save an access token before creating products",
        409
      );
    }

    try {
      const product = await this.polar.createProduct(client, input);
      return createdBillingProductResponse(product, input, []);
    } catch (error) {
      throw new BillingServiceError(
        "polar_product_create_failed",
        polarErrorMessage(error, "Could not create Polar product")
      );
    }
  }
}
