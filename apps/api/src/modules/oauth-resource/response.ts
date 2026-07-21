import type { Context } from "hono";
import type { OAuthResourceFailureResponse } from "@nezdemkovski/auth-oauth-resource";

export const oauthFailureResponse = (
  c: Context,
  failure: OAuthResourceFailureResponse
) => {
  if (failure.wwwAuthenticate) {
    c.header("WWW-Authenticate", failure.wwwAuthenticate);
  }

  return c.json({ error: failure.error }, failure.status);
};
