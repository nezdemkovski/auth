import type { MemoryDB } from "@better-auth/memory-adapter";
import { Hono } from "hono";

import { createReferenceProductAuth } from "../auth/product-auth";
import { createReferenceProductDatabase } from "../db/memory";
import { registerAccountRoutes } from "../modules/account/http";

export type ReferenceProductAppOptions = {
  origin: string;
  secret: string;
  authIssuer: string;
  authClientId: string;
  authClientSecret: string;
  database?: MemoryDB;
};

export const createReferenceProductApp = (
  options: ReferenceProductAppOptions
) => {
  const database = options.database ?? createReferenceProductDatabase();
  const auth = createReferenceProductAuth({
    baseURL: `${options.origin}/api/auth`,
    secret: options.secret,
    authIssuer: options.authIssuer,
    authClientId: options.authClientId,
    authClientSecret: options.authClientSecret,
    database
  });
  const app = new Hono();

  app.get("/", (c) => c.json({ app: "reference-product" }));
  app.all("/api/auth/*", (c) => auth.handler(c.req.raw));
  registerAccountRoutes(app, {
    auth,
    authIssuer: options.authIssuer
  });

  return {
    app,
    auth,
    database
  };
};
