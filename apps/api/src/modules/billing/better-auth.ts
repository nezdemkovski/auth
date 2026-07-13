import {
  BillingProvider,
  createPolarWebhookHandlers,
  type PolarEntitlementGrantStore,
  type PolarWebhookStore
} from "@nezdemkovski/auth-billing";
import { checkout, polar, portal, usage, webhooks } from "@polar-sh/better-auth";
import { Polar } from "@polar-sh/sdk";

import type { ProjectAuthPluginContribution } from "../../auth/project-auth";
import { logInfo, logWarn } from "../../runtime/logger";

export const createBillingAuthPluginContribution = (options: {
  entitlements: PolarEntitlementGrantStore;
  webhooks: PolarWebhookStore;
}): ProjectAuthPluginContribution => {
  return (project) => {
    const settings = project.billing;
    const products = settings.products
      .filter((product) => product.active && product.productId.trim())
      .map((product) => ({
        slug: product.slug,
        productId: product.productId
      }));

    if (
      settings.provider !== BillingProvider.Polar ||
      !settings.enabled ||
      !settings.accessToken.trim()
    ) {
      return [];
    }

    const client = new Polar({
      accessToken: settings.accessToken,
      server: settings.environment
    });
    const returnUrl = project.appUrl || project.trustedOrigins[0] || undefined;
    const webhookHandlers = createPolarWebhookHandlers({
      project,
      entitlements: options.entitlements,
      store: options.webhooks,
      logger: {
        info: logInfo,
        warn: logWarn
      }
    });
    const polarUse: NonNullable<Parameters<typeof polar>[0]["use"]> = [
      checkout({
        products,
        authenticatedUsersOnly: true,
        returnUrl,
        successUrl: returnUrl
      }),
      portal({
        returnUrl
      }),
      usage({
        creditProducts: products
      }),
      ...(settings.webhookSecret.trim()
        ? [
            webhooks({
              secret: settings.webhookSecret,
              onPayload: webhookHandlers.onPayload
            })
          ]
        : [])
    ];

    return [
      polar({
        client,
        createCustomerOnSignUp: true,
        use: polarUse
      })
    ];
  };
};
