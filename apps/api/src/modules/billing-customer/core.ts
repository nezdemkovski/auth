import {
  BillingProvider,
  createPolarClient,
  type ProjectBillingSettings
} from "@nezdemkovski/auth-billing";

import type { AuthProject } from "../../config/projects";

export enum BillingCustomerErrorCode {
  NotConfigured = "billing_not_configured",
  ProductNotFound = "billing_product_not_found",
  CheckoutFailed = "billing_checkout_failed",
  PortalFailed = "billing_portal_failed"
}

export class BillingCustomerError extends Error {
  constructor(
    readonly code: BillingCustomerErrorCode,
    readonly status: 404 | 409 | 502,
    message: string = code
  ) {
    super(message);
    this.name = "BillingCustomerError";
  }
}

type CheckoutGatewayInput = {
  billing: ProjectBillingSettings;
  subject: string;
  productId: string;
  returnUrl?: string;
};

type PortalGatewayInput = {
  billing: ProjectBillingSettings;
  subject: string;
  returnUrl?: string;
};

export type BillingCustomerGateway = {
  createCheckout(input: CheckoutGatewayInput): Promise<string>;
  createPortal(input: PortalGatewayInput): Promise<string>;
};

const defaultGateway: BillingCustomerGateway = {
  createCheckout: async (input) => {
    const client = createPolarClient(input.billing);
    if (!client) {
      throw new Error("Polar billing is not configured");
    }
    const checkout = await client.checkouts.create({
      externalCustomerId: input.subject,
      products: [input.productId],
      successUrl: input.returnUrl,
      returnUrl: input.returnUrl
    });
    return checkout.url;
  },
  createPortal: async (input) => {
    const client = createPolarClient(input.billing);
    if (!client) {
      throw new Error("Polar billing is not configured");
    }
    const portal = await client.customerSessions.create({
      externalCustomerId: input.subject,
      returnUrl: input.returnUrl
    });
    return portal.customerPortalUrl;
  }
};

export class BillingCustomerService {
  constructor(private readonly gateway: BillingCustomerGateway = defaultGateway) {}

  async createCheckout(project: AuthProject, subject: string, slug: string) {
    this.requireConfigured(project);
    const product = project.billing.products.find(
      (candidate) => candidate.active && candidate.slug === slug && candidate.productId
    );
    if (!product) {
      throw new BillingCustomerError(
        BillingCustomerErrorCode.ProductNotFound,
        404
      );
    }

    try {
      return await this.gateway.createCheckout({
        billing: project.billing,
        subject,
        productId: product.productId,
        ...this.returnUrl(project)
      });
    } catch {
      throw new BillingCustomerError(
        BillingCustomerErrorCode.CheckoutFailed,
        502
      );
    }
  }

  async createPortal(project: AuthProject, subject: string) {
    this.requireConfigured(project);
    try {
      return await this.gateway.createPortal({
        billing: project.billing,
        subject,
        ...this.returnUrl(project)
      });
    } catch {
      throw new BillingCustomerError(
        BillingCustomerErrorCode.PortalFailed,
        502
      );
    }
  }

  private requireConfigured(project: AuthProject) {
    if (
      project.billing.provider !== BillingProvider.Polar ||
      !project.billing.enabled ||
      !project.billing.accessToken.trim()
    ) {
      throw new BillingCustomerError(
        BillingCustomerErrorCode.NotConfigured,
        409
      );
    }
  }

  private returnUrl(project: AuthProject) {
    const returnUrl = project.appUrl || project.trustedOrigins[0];
    return returnUrl ? { returnUrl } : {};
  }
}
