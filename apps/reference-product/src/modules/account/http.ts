import type { AuthServer } from "@nezdemkovski/auth/server";
import { Hono } from "hono";

import { readProductAccount } from "./core";
import { productAccountResponse } from "./translator";

export enum AccountHttpError {
  Unauthorized = "unauthorized"
}

export const registerAccountRoutes = (
  app: Hono,
  options: {
    auth: AuthServer;
  }
) => {
  app.get("/api/me", async (c) => {
    try {
      const account = await readProductAccount({
        auth: options.auth,
        request: c.req.raw
      });
      if (!account) {
        return c.json({ error: AccountHttpError.Unauthorized }, 401);
      }

      return c.json(productAccountResponse(account));
    } catch {
      return c.json({ error: AccountHttpError.Unauthorized }, 401);
    }
  });
};
