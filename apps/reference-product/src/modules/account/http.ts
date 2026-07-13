import { Hono } from "hono";

import type { ReferenceProductAuth } from "../../auth/product-auth";
import { CentralIdentityMissingError, readProductAccount } from "./core";
import { productAccountResponse } from "./translator";

export enum AccountHttpError {
  Unauthorized = "unauthorized",
  CentralIdentityMissing = "central_identity_missing"
}

export const registerAccountRoutes = (
  app: Hono,
  options: {
    auth: ReferenceProductAuth;
    authIssuer: string;
  }
) => {
  app.get("/api/me", async (c) => {
    try {
      const account = await readProductAccount({
        auth: options.auth,
        headers: c.req.raw.headers,
        authIssuer: options.authIssuer
      });
      if (!account) {
        return c.json({ error: AccountHttpError.Unauthorized }, 401);
      }

      return c.json(productAccountResponse(account));
    } catch (error) {
      if (error instanceof CentralIdentityMissingError) {
        return c.json({ error: AccountHttpError.CentralIdentityMissing }, 409);
      }

      throw error;
    }
  });
};
