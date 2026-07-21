import { describe, expect, test } from "bun:test";

import { createReferenceProductApp } from "../../../http/app";

describe("reference product account HTTP boundary", () => {
  test("requires a realm access token", async () => {
    const { app } = createReferenceProductApp({
      origin: "http://reference-product.test",
      authIssuer: "https://auth.example.com/api/demo",
      authClientId: "demo-client"
    });

    const response = await app.request("/api/me");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });
});
