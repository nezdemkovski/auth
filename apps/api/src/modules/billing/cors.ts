import { cors } from "hono/cors";

import type { AuthRegistry } from "../../auth/registry";

export const createPublicBillingCors = (registry: AuthRegistry) =>
  cors({
    origin: (origin, c) => {
      const project = c.req.param("project");
      return project && registry.isTrustedOrigin(project, origin) ? origin : "";
    },
    allowHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: false,
    maxAge: 600
  });
