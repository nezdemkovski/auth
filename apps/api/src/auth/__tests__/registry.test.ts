import { describe, expect, test } from "bun:test";
import { StorageProvider } from "@nezdemkovski/auth-storage";

import {
  ADMIN_PROJECT,
  DEFAULT_PROJECT_BILLING
} from "../../config/projects";
import { AuthRegistry } from "../registry";

describe("auth registry lifecycle", () => {
  test("merges realm patches without replacing the active database pool", async () => {
    const registry = new AuthRegistry({
      databaseUrl: "postgres://auth:auth@127.0.0.1:5432/auth",
      publicBaseUrl: "https://auth.example.com",
      secret: "x".repeat(32),
      emailSender: null,
      trustProxyHeaders: false,
      projects: [ADMIN_PROJECT]
    });

    try {
      const before = registry.get(ADMIN_PROJECT.slug);
      await registry.patchProject(ADMIN_PROJECT.slug, {
        storage: {
          ...ADMIN_PROJECT.storage,
          provider: StorageProvider.S3,
          enabled: true
        }
      });
      await registry.patchProject(ADMIN_PROJECT.slug, {
        billing: {
          ...DEFAULT_PROJECT_BILLING,
          enabled: true
        }
      });
      const after = registry.get(ADMIN_PROJECT.slug);

      expect(after?.projectDb).toBe(before?.projectDb);
      expect(after?.project.storage.enabled).toBe(true);
      expect(after?.project.billing.enabled).toBe(true);
    } finally {
      await registry.close();
    }
  });
});
