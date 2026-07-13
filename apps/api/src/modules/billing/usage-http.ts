import type { Hono } from "hono";
import { cors } from "hono/cors";

import type { AuthRegistry } from "../../auth/registry";
import { OAuthResource, OAuthScope } from "../../config/oauth-resources";
import type { AuthProject } from "../../config/projects";
import type { AdminDatabase } from "../../db/admin-pool";
import { ErrorCode } from "../../runtime/error-codes";
import { isTrustedProjectMutation } from "../../http/project-csrf";
import { requireProjectSession } from "../../http/project-session";
import { isRecord } from "../../runtime/type-guards";
import { authorizeUserOAuthResourceRequest } from "../oauth-resource/http";
import {
  commitBillingUsageReservation,
  consumeBillingUsage,
  readBillingUsageSummary,
  releaseBillingUsageReservation,
  reserveBillingUsage
} from "./usage-store";

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
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      credentials: true,
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
      if (access.failure.wwwAuthenticate) {
        c.header("WWW-Authenticate", access.failure.wwwAuthenticate);
      }
      return c.json({ error: access.failure.error }, access.failure.status);
    }

    const key = c.req.query("key");
    if (!validBenefitKey(key)) {
      return c.json({ error: ErrorCode.InvalidBenefitKey }, 400);
    }

    return c.json({
      summary: await readBillingUsageSummary({
        ...options,
        project: access.value.registered.project,
        userId: access.value.subject,
        key
      })
    });
  });

  app.post("/api/:project/billing/usage/consume", async (c) => {
    if (!isTrustedProjectMutation(options.registry, c.req.param("project"), c.req.raw.headers)) {
      return c.json({ error: ErrorCode.ForbiddenOrigin }, 403);
    }
    const access = await requireProjectSession(
      options.registry,
      c.req.param("project"),
      c.req.raw.headers
    );
    if (!access.ok) {
      return c.json({ error: access.error }, access.status);
    }

    const body = await c.req.json().catch(() => null);
    const request = parseConsumeRequest(body);
    if (!request) {
      return c.json({ error: ErrorCode.InvalidBody }, 400);
    }
    const idempotencyKey = c.req.header("Idempotency-Key");
    if (!validIdempotencyKey(idempotencyKey)) {
      return c.json({ error: ErrorCode.InvalidBody }, 400);
    }

    const result = await consumeBillingUsage({
      ...options,
      project: access.registered.project,
      userId: access.session.user.id,
      key: request.key,
      amount: request.amount,
      idempotencyKey
    });

    return c.json(result, result.allowed ? 200 : 402);
  });

  app.post("/api/:project/billing/usage/reserve", async (c) => {
    if (!isTrustedProjectMutation(options.registry, c.req.param("project"), c.req.raw.headers)) {
      return c.json({ error: ErrorCode.ForbiddenOrigin }, 403);
    }
    const access = await requireProjectSession(
      options.registry,
      c.req.param("project"),
      c.req.raw.headers
    );
    if (!access.ok) {
      return c.json({ error: access.error }, access.status);
    }

    const body = await c.req.json().catch(() => null);
    const request = parseConsumeRequest(body);
    if (!request) {
      return c.json({ error: ErrorCode.InvalidBody }, 400);
    }
    const idempotencyKey = c.req.header("Idempotency-Key");
    if (!validIdempotencyKey(idempotencyKey)) {
      return c.json({ error: ErrorCode.InvalidBody }, 400);
    }

    const result = await reserveBillingUsage({
      ...options,
      project: access.registered.project,
      userId: access.session.user.id,
      key: request.key,
      amount: request.amount,
      idempotencyKey
    });

    return c.json(result, result.allowed ? 200 : 402);
  });

  app.post("/api/:project/billing/usage/commit", async (c) => {
    if (!isTrustedProjectMutation(options.registry, c.req.param("project"), c.req.raw.headers)) {
      return c.json({ error: ErrorCode.ForbiddenOrigin }, 403);
    }
    const access = await requireProjectSession(
      options.registry,
      c.req.param("project"),
      c.req.raw.headers
    );
    if (!access.ok) {
      return c.json({ error: access.error }, access.status);
    }

    const body = await c.req.json().catch(() => null);
    const request = parseReservationRequest(body);
    if (!request) {
      return c.json({ error: ErrorCode.InvalidBody }, 400);
    }

    const result = await commitBillingUsageReservation({
      ...options,
      project: access.registered.project,
      userId: access.session.user.id,
      reservationId: request.reservationId
    });
    if (!result) {
      return c.json({ error: ErrorCode.UnknownReservation }, 404);
    }

    return c.json(result);
  });

  app.post("/api/:project/billing/usage/release", async (c) => {
    if (!isTrustedProjectMutation(options.registry, c.req.param("project"), c.req.raw.headers)) {
      return c.json({ error: ErrorCode.ForbiddenOrigin }, 403);
    }
    const access = await requireProjectSession(
      options.registry,
      c.req.param("project"),
      c.req.raw.headers
    );
    if (!access.ok) {
      return c.json({ error: access.error }, access.status);
    }

    const body = await c.req.json().catch(() => null);
    const request = parseReservationRequest(body);
    if (!request) {
      return c.json({ error: ErrorCode.InvalidBody }, 400);
    }

    const result = await releaseBillingUsageReservation({
      ...options,
      project: access.registered.project,
      userId: access.session.user.id,
      reservationId: request.reservationId
    });
    if (!result) {
      return c.json({ error: ErrorCode.UnknownReservation }, 404);
    }

    return c.json(result);
  });
};

const parseConsumeRequest = (body: unknown) => {
  if (!isRecord(body) || !validBenefitKey(body.key)) {
    return null;
  }

  const amount = typeof body.amount === "number" ? body.amount : 1;
  if (!Number.isInteger(amount) || amount < 1 || amount > 1000) {
    return null;
  }

  return {
    key: body.key,
    amount
  };
};

const validBenefitKey = (value: unknown): value is string => {
  return typeof value === "string" && /^[a-z][a-z0-9_]*$/.test(value);
};

export const validIdempotencyKey = (value: unknown): value is string => {
  return (
    typeof value === "string" &&
    value.length >= 16 &&
    value.length <= 128 &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  );
};

const parseReservationRequest = (body: unknown) => {
  if (!isRecord(body) || typeof body.reservationId !== "string") {
    return null;
  }

  const reservationId = body.reservationId.trim();
  if (!/^[A-Za-z0-9_-]{16,}$/.test(reservationId)) {
    return null;
  }

  return {
    reservationId
  };
};
