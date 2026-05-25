import { describe, expect, test } from "bun:test";

import { isTrustedAdminRequest } from "../csrf";

describe("admin API security helpers", () => {
  test("accepts same-origin state-changing admin requests", () => {
    expect(
      isTrustedAdminRequest(
        new Headers({
          origin: "https://auth.example.com"
        }),
        "https://auth.example.com"
      )
    ).toBe(true);
  });

  test("rejects cross-origin state-changing admin requests", () => {
    expect(
      isTrustedAdminRequest(
        new Headers({
          origin: "https://evil.example"
        }),
        "https://auth.example.com"
      )
    ).toBe(false);
  });

  test("does not trust Referer when Origin is absent", () => {
    expect(
      isTrustedAdminRequest(
        new Headers({
          referer: "https://auth.example.com/admin/settings"
        }),
        "https://auth.example.com"
      )
    ).toBe(false);
    expect(
      isTrustedAdminRequest(
        new Headers({
          referer: "not a url"
        }),
        "https://auth.example.com"
      )
    ).toBe(false);
  });

  test("accepts browser same-origin fetch metadata when Origin is absent", () => {
    expect(
      isTrustedAdminRequest(
        new Headers({
          "sec-fetch-site": "same-origin"
        }),
        "https://auth.example.com"
      )
    ).toBe(true);
  });

  test("rejects requests without origin, fetch metadata, or referer", () => {
    expect(
      isTrustedAdminRequest(
        new Headers(),
        "https://auth.example.com"
      )
    ).toBe(false);
  });
});
