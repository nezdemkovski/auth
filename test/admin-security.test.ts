import { describe, expect, test } from "bun:test";

import { __adminTestUtils } from "../src/http/admin";

describe("admin API security helpers", () => {
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

  test("falls back to referer origin when Origin is absent", () => {
    expect(
      __adminTestUtils.isTrustedAdminRequest(
        new Headers({
          referer: "https://auth.example.com/admin/settings"
        }),
        "https://auth.example.com"
      )
    ).toBe(true);
    expect(
      __adminTestUtils.isTrustedAdminRequest(
        new Headers({
          referer: "not a url"
        }),
        "https://auth.example.com"
      )
    ).toBe(false);
  });
});
