import { describe, expect, test } from "bun:test";

import {
  clientKey,
  DIRECT_CLIENT_IP_HEADER,
  normalizeRateLimitPath,
  rateLimitRuleName
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

  test("trusts only the router-owned client IP header in proxy mode", () => {
    const headers = new Headers({
      "x-auth-client-ip": "198.51.100.10",
      "cf-connecting-ip": "203.0.113.10",
      "x-forwarded-for": "203.0.113.11, 10.0.0.1"
    });

    expect(clientKey(headers, { trustProxyHeaders: true })).toBe("198.51.100.10");
  });

  test("fails closed when the router-owned client IP header is missing", () => {
    expect(
      clientKey(
        new Headers({
          "cf-connecting-ip": "203.0.113.10",
          "x-forwarded-for": "203.0.113.11, 10.0.0.1"
        }),
        { trustProxyHeaders: true }
      )
    ).toBeNull();
    expect(clientKey(new Headers(), { trustProxyHeaders: true })).toBeNull();
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

  test("matches realm sign-in, signup, reset, and verification routes", () => {
    expect(rateLimitRuleName("POST", "/api/demo/auth/sign-in/email")).toBe("project-signin");
    expect(rateLimitRuleName("POST", "/api/demo/auth/sign-up/email")).toBe("project-signup");
    expect(rateLimitRuleName("POST", "/api/demo/auth/forget-password")).toBe("password-reset");
    expect(rateLimitRuleName("POST", "/api/demo/auth/send-verification-email")).toBe("email-verification");
  });
});
