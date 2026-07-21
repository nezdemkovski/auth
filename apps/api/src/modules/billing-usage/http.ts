import type { Hono } from "hono";
import {
  mutateBillingUsage,
  parseBillingUsageMutationInput,
  parseBillingUsageMutationOperation,
  readUserBillingUsageSummary,
  validBenefitKey
} from "@nezdemkovski/auth-billing";
import {
  OAuthResource,
  OAuthScope,
  type OAuthResourceAuthorizer,
} from "@nezdemkovski/auth-oauth-resource";

import type { AuthRegistry, RegisteredProject } from "../../auth/registry";
import type { AuthProject } from "../../config/projects";
import type { AdminDatabase } from "../../db/admin-pool";
import { ErrorCode } from "../../runtime/error-codes";
import { createPublicBillingCors } from "../billing/cors";
import { oauthFailureResponse } from "../oauth-resource/response";
import {
  billingUsageFailureResponse,
  billingUsageMutationResponse
} from "./translator";
import { createBillingSubjectDirectory } from "./store";

type BillingVariables = {
  registry: AuthRegistry;
};

type PublicBillingOptions = {
  registry: AuthRegistry;
  databaseUrl: string;
  adminProject: AuthProject;
  adminDb: AdminDatabase;
  authorizer: OAuthResourceAuthorizer<RegisteredProject>;
};

export const registerBillingUsageRoutes = (
  app: Hono<{ Variables: BillingVariables }>,
  options: PublicBillingOptions
) => {
  app.use(
    "/api/:project/billing/*",
    createPublicBillingCors(options.registry)
  );

  app.get("/api/:project/billing/usage/summary", async (c) => {
    const access = await options.authorizer.authorizeUser({
      projectSlug: c.req.param("project"),
      request: c.req.raw,
      resource: OAuthResource.Application,
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
        project: access.value.registered.project,
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

    const access = await options.authorizer.authorizeService({
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
          project: access.value.registered.project,
          subjects: createBillingSubjectDirectory(
            access.value.registered.projectDb
          ),
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
