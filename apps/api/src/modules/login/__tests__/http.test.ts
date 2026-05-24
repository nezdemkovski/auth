import { describe, expect, test } from "bun:test";

import { createLoginSessionCode, exchangeLoginCode } from "../http";

const unusedOptions = {
  registry: {} as never,
  secret: "test-secret",
  codeStore: {} as never
};

describe("login HTTP handlers", () => {
  test("returns invalid_body for malformed session-code requests", async () => {
    const response = await createLoginSessionCode(
      new Request("http://auth.local/api/openmarkers/login/session-code", {
        method: "POST",
        body: JSON.stringify({})
      }),
      "openmarkers",
      unusedOptions
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_body" });
  });

  test("returns invalid_body for malformed token exchange requests", async () => {
    const response = await exchangeLoginCode(
      new Request("http://auth.local/api/openmarkers/login/token", {
        method: "POST",
        body: JSON.stringify({})
      }),
      "openmarkers",
      unusedOptions
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_body" });
  });
});
