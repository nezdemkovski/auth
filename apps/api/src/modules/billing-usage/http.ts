import type { Context, Hono } from "hono";
import { cors } from "hono/cors";

import type { AuthRegistry } from "../../auth/registry";
import { OAuthResource, OAuthScope } from "../../config/oauth-resources";
import type { AuthProject } from "../../config/projects";
import type { AdminDatabase } from "../../db/admin-pool";
import { ErrorCode } from "../../runtime/error-codes";
import {
  authorizeServiceOAuthResourceRequest,
  authorizeUserOAuthResourceRequest
} from "../oauth-resource/http";
import type { OAuthResourceFailureResponse } from "../oauth-resource/translator";
import { mutateBillingUsage, readUserBillingUsageSummary } from "./core";
import {
  billingUsageFailureResponse,
  billingUsageMutationResponse
} from "./translator";
import {
  parseBillingUsageMutationInput,
  parseBillingUsageMutationOperation,
  validBenefitKey
} from "./validator";

type BillingVariables = {
  registry: AuthRegistry;
};

type PublicBillingOptions = {
  registry: AuthRegistry;
  publicBaseUrl: string;
  databaseUrl: string;
  adminProject: AuthProject;
  adminDb: AdminDatabase;
};

type BillingContext = Context<{ Variables: BillingVariables }>;

export const registerBillingUsageRoutes = (
  app: Hono<{ Variables: BillingVariables }>,
  options: PublicBillingOptions
) => {
  app.use(
    "/api/:project/billing/*",
    cors({
      origin: (origin, c) => {
        const project = c.req.param("project");
        if (!project) {
          return "";
        }

        return options.registry.isTrustedOrigin(project, origin) ? origin : "";
      },
      allowHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      credentials: false,
      maxAge: 600
    })
  );

  app.get("/api/:project/billing/usage/summary", async (c) => {
    const access = await authorizeUserOAuthResourceRequest({
      registry: options.registry,
      publicBaseUrl: options.publicBaseUrl,
      projectSlug: c.req.param("project"),
      request: c.req.raw,
      resource: OAuthResource.Billing,
      scopes: [OAuthScope.BillingUsageRead]
    });
    if (!access.ok) {
      return oauthFailureResponse(c, access.failure);
    }

    const key = c.req.query("key");
    if (!validBenefitKey(key)) {
      return c.json({ error: ErrorCode.InvalidBenefitKey }, 400);
    }

    return c.json({
      summary: await readUserBillingUsageSummary({
        ...options,
        registered: access.value.registered,
        subject: access.value.subject,
        key
      })
    });
  });

  app.post("/api/:project/billing/usage/:operation", async (c) => {
    const operation = parseBillingUsageMutationOperation(
      c.req.param("operation")
    );
    if (!operation) {
      return c.json({ error: ErrorCode.NotFound }, 404);
    }

    const access = await authorizeServiceOAuthResourceRequest({
      registry: options.registry,
      publicBaseUrl: options.publicBaseUrl,
      projectSlug: c.req.param("project"),
      request: c.req.raw,
      resource: OAuthResource.Billing,
      scopes: [OAuthScope.BillingUsageWrite]
    });
    if (!access.ok) {
      return oauthFailureResponse(c, access.failure);
    }

    const input = parseBillingUsageMutationInput({
      operation,
      body: await c.req.json().catch(() => null),
      idempotencyKey: c.req.header("Idempotency-Key")
    });
    if (!input) {
      return c.json({ error: ErrorCode.InvalidBody }, 400);
    }

    try {
      const response = billingUsageMutationResponse(
        await mutateBillingUsage({
          ...options,
          registered: access.value.registered,
          input
        })
      );
      return c.json(response.body, response.status);
    } catch (error) {
      const failure = billingUsageFailureResponse(error);
      if (!failure) {
        throw error;
      }

      return c.json(failure.body, failure.status);
    }
  });
};

const oauthFailureResponse = (
  c: BillingContext,
  failure: OAuthResourceFailureResponse
) => {
  if (failure.wwwAuthenticate) {
    c.header("WWW-Authenticate", failure.wwwAuthenticate);
  }

  return c.json({ error: failure.error }, failure.status);
};
