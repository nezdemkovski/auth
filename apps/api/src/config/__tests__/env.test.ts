import { describe, expect, test } from "bun:test";
import { EmailProvider } from "@nezdemkovski/auth-delivery";
import { StorageProvider } from "@nezdemkovski/auth-storage";

import { loadEnv } from "../env";

const baseEnv = {
  AUTH_PUBLIC_BASE_URL: "https://auth.example.com",
  BETTER_AUTH_SECRET: "x".repeat(32),
  SECRET_ENCRYPTION_KEY: "y".repeat(32),
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

  test("requires a separate encryption key", () => {
    expect(() => {
      const { SECRET_ENCRYPTION_KEY: _secretEncryptionKey, ...env } = baseEnv;
      loadEnv(env);
    }).toThrow("SECRET_ENCRYPTION_KEY is required");
  });

  test("rejects short encryption keys", () => {
    expect(() =>
      loadEnv({
        ...baseEnv,
        SECRET_ENCRYPTION_KEY: "short"
      })
    ).toThrow("SECRET_ENCRYPTION_KEY must be at least 32 characters");
  });

  test("parses Resend email settings", () => {
    const env = loadEnv({
      ...baseEnv,
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "Auth <auth@example.com>",
      RESEND_API_KEY: "re_test"
    });

    expect(env.email).toEqual({
      provider: EmailProvider.Resend,
      from: "Auth <auth@example.com>",
      apiKey: "re_test"
    });
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

  test("parses deployment-managed S3 storage", () => {
    const env = loadEnv({
      ...baseEnv,
      AUTH_STORAGE_PROVIDER: "s3",
      AUTH_STORAGE_ENDPOINT: "http://rustfs:9000",
      AUTH_STORAGE_REGION: "us-east-1",
      AUTH_STORAGE_BUCKET: "auth-public",
      AUTH_STORAGE_PUBLIC_BASE_URL: "http://localhost:9000/auth-public/",
      AUTH_STORAGE_ACCESS_KEY_ID: "access",
      AUTH_STORAGE_SECRET_ACCESS_KEY: "secret"
    });

    expect(env.storage).toEqual({
      provider: StorageProvider.S3,
      enabled: false,
      managed: true,
      endpoint: "http://rustfs:9000",
      region: "us-east-1",
      bucket: "auth-public",
      publicBaseUrl: "http://localhost:9000/auth-public",
      accessKeyId: "access",
      secretAccessKey: "secret"
    });
  });

  test("rejects incomplete deployment-managed S3 storage", () => {
    expect(() =>
      loadEnv({
        ...baseEnv,
        AUTH_STORAGE_PROVIDER: "s3"
      })
    ).toThrow("AUTH_STORAGE_ENDPOINT is required");
  });
});
