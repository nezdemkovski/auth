import { describe, expect, test } from "bun:test";

import {
  clientKey,
  DIRECT_CLIENT_IP_HEADER,
  normalizeRateLimitPath
} from "../security";

describe("http security helpers", () => {
  test("does not trust client-supplied proxy headers by default", () => {
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.10",
      "x-forwarded-for": "203.0.113.11"
    });

    expect(clientKey(headers, { trustProxyHeaders: false })).toBeNull();
  });

  test("uses the Bun-provided direct IP when proxy headers are disabled", () => {
    const headers = new Headers({
      [DIRECT_CLIENT_IP_HEADER]: "198.51.100.10",
      "cf-connecting-ip": "203.0.113.10"
    });

    expect(clientKey(headers, { trustProxyHeaders: false })).toBe("198.51.100.10");
  });

  test("uses Cloudflare IP first when proxy headers are trusted", () => {
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.10",
      "x-forwarded-for": "203.0.113.11, 10.0.0.1"
    });

    expect(clientKey(headers, { trustProxyHeaders: true })).toBe("203.0.113.10");
  });

  test("falls back to first forwarded IP and then unknown in trusted proxy mode", () => {
    expect(
      clientKey(
        new Headers({ "x-forwarded-for": "203.0.113.11, 10.0.0.1" }),
        { trustProxyHeaders: true }
      )
    ).toBe("203.0.113.11");
    expect(clientKey(new Headers(), { trustProxyHeaders: true })).toBe(
      "unknown"
    );
  });

  test("normalizes project auth paths into one rate-limit bucket", () => {
    expect(
      normalizeRateLimitPath("/api/demo/auth/sign-in/email")
    ).toBe("/api/:project/auth/sign-in/email");
    expect(normalizeRateLimitPath("/api/admin/auth/sign-in/email")).toBe(
      "/api/:project/auth/sign-in/email"
    );
    expect(normalizeRateLimitPath("/admin/login")).toBe("/admin/login");
  });
});
