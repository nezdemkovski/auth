import { describe, expect, test } from "bun:test";
import {
  ADMIN_REALM,
  type Realm
} from "@nezdemkovski/auth-realm";

import {
  AuthRegistry,
  type ProjectAuthProtocolOptions
} from "../index";

type TestProject = Realm & {
  runtimeLabel: string;
};

const protocol: ProjectAuthProtocolOptions<TestProject> = {
  oauthProvider: {
    scopes: ["openid"],
    dynamicClientScopes: ["openid"],
    resources: () => [],
    userAccessTokenClaims: {},
    serviceAccessTokenClaims: {}
  }
};

describe("auth registry lifecycle", () => {
  test("merges app-owned patches without replacing the active database pool", async () => {
    const project: TestProject = {
      ...ADMIN_REALM,
      runtimeLabel: "before"
    };
    const registry = new AuthRegistry({
      databaseUrl: "postgres://auth:auth@127.0.0.1:5432/auth",
      publicBaseUrl: "https://auth.example.com",
      secret: "x".repeat(32),
      trustedClientIpHeader: "x-demo-client-ip",
      trustProxyHeaders: false,
      projects: [project],
      protocol
    });

    try {
      const before = registry.get(project.slug);
      await registry.patchProject(project.slug, {
        runtimeLabel: "after"
      });
      const after = registry.get(project.slug);

      expect(after?.projectDb).toBe(before?.projectDb);
      expect(after?.project.runtimeLabel).toBe("after");
    } finally {
      await registry.close();
    }
  });
});
