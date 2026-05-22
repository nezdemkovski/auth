import { describe, expect, test } from "bun:test";

import { loadEnv } from "../src/config/env";

const baseEnv = {
  AUTH_PUBLIC_BASE_URL: "https://auth.example.com",
  BETTER_AUTH_SECRET: "x".repeat(32),
  POSTGRES_HOST: "postgres.example.com",
  POSTGRES_DB: "auth",
  POSTGRES_USER: "auth",
  POSTGRES_PASSWORD: "secret"
};

describe("loadEnv email config", () => {
  test("trims AUTH_PUBLIC_BASE_URL and builds DATABASE_URL from Postgres parts", () => {
    const env = loadEnv({
      ...baseEnv,
      AUTH_PUBLIC_BASE_URL: "https://auth.example.com///"
    });

    expect(env.publicBaseUrl).toBe("https://auth.example.com");
    expect(env.databaseUrl).toBe(
      "postgres://auth:secret@postgres.example.com:5432/auth"
    );
  });

  test("rejects short Better Auth secrets", () => {
    expect(() =>
      loadEnv({
        ...baseEnv,
        BETTER_AUTH_SECRET: "short"
      })
    ).toThrow("BETTER_AUTH_SECRET must be at least 32 characters");
  });

  test("parses Resend email settings", () => {
    const env = loadEnv({
      ...baseEnv,
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "Auth <auth@example.com>",
      RESEND_API_KEY: "re_test"
    });

    expect(env.email).toEqual({
      provider: "resend",
      from: "Auth <auth@example.com>",
      apiKey: "re_test"
    });
    expect(env.emailServiceEnabled).toBe(true);
  });

  test("rejects unknown email providers", () => {
    expect(() =>
      loadEnv({
        ...baseEnv,
        EMAIL_PROVIDER: "smtp"
      })
    ).toThrow("EMAIL_PROVIDER must be one of: none, cloudflare, resend");
  });

  test("does not trust proxy IP headers by default", () => {
    const env = loadEnv(baseEnv);

    expect(env.trustProxyHeaders).toBe(false);
  });

  test("parses TRUST_PROXY_HEADERS", () => {
    const env = loadEnv({
      ...baseEnv,
      TRUST_PROXY_HEADERS: "true"
    });

    expect(env.trustProxyHeaders).toBe(true);
  });

  test("rejects invalid TRUST_PROXY_HEADERS", () => {
    expect(() =>
      loadEnv({
        ...baseEnv,
        TRUST_PROXY_HEADERS: "maybe"
      })
    ).toThrow("TRUST_PROXY_HEADERS must be a boolean");
  });
});
