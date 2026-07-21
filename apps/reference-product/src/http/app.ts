import { createAuthServer } from "@nezdemkovski/auth/server";
import { Hono } from "hono";

import { registerAccountRoutes } from "../modules/account/http";

export type ReferenceProductAppOptions = {
  origin: string;
  authIssuer: string;
  authClientId: string;
};

export const createReferenceProductApp = (
  options: ReferenceProductAppOptions
) => {
  const auth = createAuthServer({
    issuer: options.authIssuer,
    clientId: options.authClientId
  });
  const app = new Hono();

  app.get("/", (c) => c.json({ app: "reference-product" }));
  registerAccountRoutes(app, { auth });

  return {
    app,
    auth
  };
};
