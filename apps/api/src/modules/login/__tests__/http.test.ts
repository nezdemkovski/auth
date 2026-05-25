import { describe, expect, test } from "bun:test";

import { createLoginSessionCode, exchangeLoginCode, type LoginOptions } from "../http";

const unusedOptions: LoginOptions = {
  registry: {
    get() {
      return null;
    },
    isTrustedOrigin() {
      return false;
    }
  },
  secret: "test-secret",
  codeStore: {
    connect: async () => {},
    close: () => {},
    set: async () => {},
    get: async () => null,
    delete: async () => {}
  }
};

describe("login HTTP handlers", () => {
  test("returns invalid_body for malformed session-code requests", async () => {
    const response = await createLoginSessionCode(
      new Request("http://auth.local/api/demo/login/session-code", {
        method: "POST",
        body: JSON.stringify({})
      }),
      "demo",
      unusedOptions
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_body" });
  });

  test("returns invalid_body for malformed token exchange requests", async () => {
    const response = await exchangeLoginCode(
      new Request("http://auth.local/api/demo/login/token", {
        method: "POST",
        body: JSON.stringify({})
      }),
      "demo",
      unusedOptions
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_body" });
  });
});
