import { describe, expect, test } from "bun:test";

import { __adminTestUtils } from "../src/http/admin";

describe("admin API security helpers", () => {
  test("detects Polar invalid token errors for environment diagnostics", () => {
    expect(
      __adminTestUtils.isPolarInvalidTokenError({
        body: JSON.stringify({
          error: "invalid_token",
          error_description: "The access token is invalid"
        })
      })
    ).toBe(true);
    expect(
      __adminTestUtils.isPolarInvalidTokenError({
        body: JSON.stringify({
          error: "insufficient_scope"
        })
      })
    ).toBe(false);
  });

  test("accepts same-origin state-changing admin requests", () => {
    expect(
      __adminTestUtils.isTrustedAdminRequest(
        new Headers({
          origin: "https://auth.example.com"
        }),
        "https://auth.example.com"
      )
    ).toBe(true);
  });

  test("rejects cross-origin state-changing admin requests", () => {
    expect(
      __adminTestUtils.isTrustedAdminRequest(
        new Headers({
          origin: "https://evil.example"
        }),
        "https://auth.example.com"
      )
    ).toBe(false);
  });

  test("does not trust Referer when Origin is absent", () => {
    expect(
      __adminTestUtils.isTrustedAdminRequest(
        new Headers({
          referer: "https://auth.example.com/admin/settings"
        }),
        "https://auth.example.com"
      )
    ).toBe(false);
    expect(
      __adminTestUtils.isTrustedAdminRequest(
        new Headers({
          referer: "not a url"
        }),
        "https://auth.example.com"
      )
    ).toBe(false);
  });

  test("accepts browser same-origin fetch metadata when Origin is absent", () => {
    expect(
      __adminTestUtils.isTrustedAdminRequest(
        new Headers({
          "sec-fetch-site": "same-origin"
        }),
        "https://auth.example.com"
      )
    ).toBe(true);
  });

  test("rejects requests without origin, fetch metadata, or referer", () => {
    expect(
      __adminTestUtils.isTrustedAdminRequest(
        new Headers(),
        "https://auth.example.com"
      )
    ).toBe(false);
  });
});
