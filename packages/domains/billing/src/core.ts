import type {
  AdminDatabase,
  AdminSchema
} from "@nezdemkovski/auth-platform-database";

import {
  BillingEnvironment,
  type BillingRealm,
  type ProjectBillingSettings
} from "./model";
import {
  createPolarClient,
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

type PolarClient = NonNullable<ReturnType<typeof createPolarClient>>;

export type BillingServiceOptions = {
  databaseUrl: string;
  adminProject: AdminSchema;
  adminDb?: AdminDatabase;
  publicBaseUrl: string;
  encryptionSecret: string;
  applyRuntimeSettings(
    projectSlug: string,
    billing: ProjectBillingSettings
  ): Promise<void>;
  polar?: BillingPolarGateway;
};

export type BillingPolarGateway = {
  verifyAccess: typeof verifyPolarAccess;
  createClient(settings: ProjectBillingSettings): PolarClient | null;
  listProducts(client: PolarClient): Promise<PolarProductSummary[]>;
  createProduct(
    client: PolarClient,
    input: CreatePolarProductInput
  ): Promise<PolarProductSummary>;
};

const defaultPolarGateway: BillingPolarGateway = {
  verifyAccess: verifyPolarAccess,
  createClient: createPolarClient,
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
  private readonly polar: BillingPolarGateway;

  constructor(private readonly options: BillingServiceOptions) {
    this.polar = options.polar ?? defaultPolarGateway;
  }

  async readSettings(realm: BillingRealm) {
    const settings = await readBillingSettingsState({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject,
      adminDb: this.options.adminDb,
      projectSlug: realm.slug
    });

    return billingSettingsResponse({
      settings,
      projectSlug: realm.slug,
      publicBaseUrl: this.options.publicBaseUrl
    });
  }

  async updateSettings(realm: BillingRealm, patch: BillingSettingsPatch) {
    validateBillingSettingsPatch(patch);
    const billing = await updateBillingSettings({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject,
      adminDb: this.options.adminDb,
      projectSlug: realm.slug,
      encryptionSecret: this.options.encryptionSecret,
      patch
    });
    await this.options.applyRuntimeSettings(realm.slug, billing);

    return this.readSettings({
      slug: realm.slug,
      billing
    });
  }

  async verifyPolar(
    realm: BillingRealm,
    input: {
      accessToken?: unknown;
      environment?: unknown;
    }
  ) {
    const accessToken =
      typeof input.accessToken === "string" && input.accessToken.trim()
        ? input.accessToken.trim()
        : realm.billing.accessToken;
    const environment =
      input.environment === BillingEnvironment.Production ||
      input.environment === BillingEnvironment.Sandbox
        ? input.environment
        : realm.billing.environment;
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

  async listPolarProducts(realm: BillingRealm) {
    const client = this.polar.createClient(realm.billing);
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

  async createPolarProduct(
    realm: BillingRealm,
    input: CreatePolarProductInput
  ) {
    const client = this.polar.createClient(realm.billing);
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
