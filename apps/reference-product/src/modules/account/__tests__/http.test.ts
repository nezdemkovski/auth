import { describe, expect, test } from "bun:test";

import { createReferenceProductApp } from "../../../http/app";

describe("reference product account HTTP boundary", () => {
  test("requires a local Better Auth session", async () => {
    const originalFetch = globalThis.fetch;
    const discoveryFetch = Object.assign(
      (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1]
      ) => {
        const url = input instanceof Request ? new URL(input.url) : new URL(input);
        if (url.pathname.endsWith("/.well-known/openid-configuration")) {
          return Promise.resolve(
            Response.json({
              issuer: "https://auth.example.com/api/demo",
              authorization_endpoint:
                "https://auth.example.com/api/demo/auth/oauth2/authorize",
              token_endpoint: "https://auth.example.com/api/demo/auth/oauth2/token",
              userinfo_endpoint:
                "https://auth.example.com/api/demo/auth/oauth2/userinfo"
            })
          );
        }

        return originalFetch(input, init);
      },
      {
        preconnect: originalFetch.preconnect
      }
    );
    globalThis.fetch = discoveryFetch;

    try {
      const { app } = createReferenceProductApp({
        origin: "http://reference-product.test",
        secret: "reference-product-test-secret-at-least-32-characters",
        authIssuer: "https://auth.example.com/api/demo",
        authClientId: "demo-client",
        authClientSecret: "demo-secret"
      });

      const response = await app.request("/api/me");

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthorized" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
