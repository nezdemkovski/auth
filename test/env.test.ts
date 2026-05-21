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
});
