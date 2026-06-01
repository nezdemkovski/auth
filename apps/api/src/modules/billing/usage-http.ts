import type { Hono } from "hono";
import { cors } from "hono/cors";

import type { AuthRegistry, RegisteredProject } from "../../auth/registry";
import type { AuthProject } from "../../config/projects";
import type { AdminDatabase } from "../../db/admin-pool";
import { isRecord } from "../../runtime/type-guards";
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
    const project = options.registry.get(c.req.param("project"));
    if (!project) {
      return c.json({ error: "unknown_project" }, 404);
    }

    const session = await getProjectSession(project, c.req.raw.headers);
    if (!session) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const key = c.req.query("key");
    if (!validBenefitKey(key)) {
      return c.json({ error: "invalid_benefit_key" }, 400);
    }

    return c.json({
      summary: await readBillingUsageSummary({
        ...options,
        project: project.project,
        userId: session.user.id,
        key
      })
    });
  });

  app.post("/api/:project/billing/usage/consume", async (c) => {
    const project = options.registry.get(c.req.param("project"));
    if (!project) {
      return c.json({ error: "unknown_project" }, 404);
    }

    const session = await getProjectSession(project, c.req.raw.headers);
    if (!session) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const body = await c.req.json().catch(() => null);
    const request = parseConsumeRequest(body);
    if (!request) {
      return c.json({ error: "invalid_body" }, 400);
    }

    const result = await consumeBillingUsage({
      ...options,
      project: project.project,
      userId: session.user.id,
      key: request.key,
      amount: request.amount
    });

    return c.json(result, result.allowed ? 200 : 402);
  });

  app.post("/api/:project/billing/usage/reserve", async (c) => {
    const project = options.registry.get(c.req.param("project"));
    if (!project) {
      return c.json({ error: "unknown_project" }, 404);
    }

    const session = await getProjectSession(project, c.req.raw.headers);
    if (!session) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const body = await c.req.json().catch(() => null);
    const request = parseConsumeRequest(body);
    if (!request) {
      return c.json({ error: "invalid_body" }, 400);
    }

    const result = await reserveBillingUsage({
      ...options,
      project: project.project,
      userId: session.user.id,
      key: request.key,
      amount: request.amount
    });

    return c.json(result, result.allowed ? 200 : 402);
  });

  app.post("/api/:project/billing/usage/commit", async (c) => {
    const project = options.registry.get(c.req.param("project"));
    if (!project) {
      return c.json({ error: "unknown_project" }, 404);
    }

    const session = await getProjectSession(project, c.req.raw.headers);
    if (!session) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const body = await c.req.json().catch(() => null);
    const request = parseReservationRequest(body);
    if (!request) {
      return c.json({ error: "invalid_body" }, 400);
    }

    const result = await commitBillingUsageReservation({
      ...options,
      project: project.project,
      userId: session.user.id,
      reservationId: request.reservationId
    });
    if (!result) {
      return c.json({ error: "unknown_reservation" }, 404);
    }

    return c.json(result);
  });

  app.post("/api/:project/billing/usage/release", async (c) => {
    const project = options.registry.get(c.req.param("project"));
    if (!project) {
      return c.json({ error: "unknown_project" }, 404);
    }

    const session = await getProjectSession(project, c.req.raw.headers);
    if (!session) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const body = await c.req.json().catch(() => null);
    const request = parseReservationRequest(body);
    if (!request) {
      return c.json({ error: "invalid_body" }, 400);
    }

    const result = await releaseBillingUsageReservation({
      ...options,
      project: project.project,
      userId: session.user.id,
      reservationId: request.reservationId
    });
    if (!result) {
      return c.json({ error: "unknown_reservation" }, 404);
    }

    return c.json(result);
  });
};

const getProjectSession = async (project: RegisteredProject, headers: Headers) => {
  return project.auth.api.getSession({ headers });
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
