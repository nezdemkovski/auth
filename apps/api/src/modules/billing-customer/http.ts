import type { Context, Hono } from "hono";
import {
  OAuthResource,
  OAuthScope,
  type OAuthResourceAuthorizer
} from "@nezdemkovski/auth-oauth-resource";

import type { AuthRegistry, RegisteredProject } from "../../auth/registry";
import { ErrorCode } from "../../runtime/error-codes";
import { createPublicBillingCors } from "../billing/cors";
import { oauthFailureResponse } from "../oauth-resource/response";
import { BillingCustomerError, type BillingCustomerService } from "./core";
import { parseCreateCheckout } from "./validator";

type BillingCustomerVariables = {
  registry: AuthRegistry;
};

type BillingCustomerOptions = {
  registry: AuthRegistry;
  authorizer: OAuthResourceAuthorizer<RegisteredProject>;
  service: BillingCustomerService;
};

export const registerBillingCustomerRoutes = (
  app: Hono<{ Variables: BillingCustomerVariables }>,
  options: BillingCustomerOptions
) => {
  app.use(
    "/api/:project/billing/checkout",
    createPublicBillingCors(options.registry)
  );
  app.use(
    "/api/:project/billing/portal",
    createPublicBillingCors(options.registry)
  );

  app.post("/api/:project/billing/checkout", async (c) => {
    const access = await options.authorizer.authorizeUser({
      projectSlug: c.req.param("project"),
      request: c.req.raw,
      resource: OAuthResource.Application,
      scopes: [OAuthScope.BillingCheckoutCreate]
    });
    if (!access.ok) {
      return oauthFailureResponse(c, access.failure);
    }

    const input = parseCreateCheckout(await c.req.json().catch(() => null));
    if (!input) {
      return c.json({ error: ErrorCode.InvalidBody }, 400);
    }

    try {
      return c.json({
        url: await options.service.createCheckout(
          access.value.registered.project,
          access.value.subject,
          input.slug
        )
      });
    } catch (error) {
      return customerErrorResponse(c, error);
    }
  });

  app.post("/api/:project/billing/portal", async (c) => {
    const access = await options.authorizer.authorizeUser({
      projectSlug: c.req.param("project"),
      request: c.req.raw,
      resource: OAuthResource.Application,
      scopes: [OAuthScope.BillingPortalRead]
    });
    if (!access.ok) {
      return oauthFailureResponse(c, access.failure);
    }

    try {
      return c.json({
        url: await options.service.createPortal(
          access.value.registered.project,
          access.value.subject
        )
      });
    } catch (error) {
      return customerErrorResponse(c, error);
    }
  });
};

const customerErrorResponse = (c: Context, error: unknown) => {
  if (error instanceof BillingCustomerError) {
    return c.json({ error: error.code }, error.status);
  }
  throw error;
};
