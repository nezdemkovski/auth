import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { EmailProvider } from "@nezdemkovski/auth-delivery";
import { ObservabilityProvider } from "@nezdemkovski/auth-observability";
import {
  RealmAgentAuthMode,
  RealmTwoFactorRequirement
} from "@nezdemkovski/auth-realm";

import {
  bootstrapIntegrationDatabase,
  createIntegrationAdminSession,
  createIntegrationApp,
  integrationPublicBaseUrl,
  readIntegrationJson,
  resetAndBootstrapIntegrationDatabase,
  resetIntegrationDatabase
} from "./setup";
import { DIRECT_CLIENT_IP_HEADER } from "../src/http/security";

describe("admin API integration", () => {
  beforeEach(async () => {
    await resetAndBootstrapIntegrationDatabase();
  });

  test("prints a temporary admin credential only during first bootstrap", async () => {
    await resetIntegrationDatabase();
    const info = spyOn(console, "info").mockImplementation(() => {});

    try {
      await bootstrapIntegrationDatabase();
      const firstBootstrapCredentials = info.mock.calls
        .map(([message]) => String(message))
        .filter((message) => message.includes("temporary admin password:"));

      expect(firstBootstrapCredentials).toHaveLength(1);
      expect(firstBootstrapCredentials[0]).toMatch(
        /^\[bootstrap\] admin: temporary admin password: [A-Za-z0-9_-]{32}$/
      );

      info.mockClear();
      await bootstrapIntegrationDatabase();
      expect(
        info.mock.calls
          .map(([message]) => String(message))
          .filter((message) => message.includes("temporary admin password:"))
      ).toHaveLength(0);
    } finally {
      info.mockRestore();
    }
  });

  test("requires admin auth and same-origin state-changing requests", async () => {
    const { app, registry, close } = await createIntegrationApp();

    try {
      const unauthorized = await app.request("/admin/api/projects", {
        headers: {
          [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
        }
      });
      expect(unauthorized.status).toBe(401);

      const { cookie } = await createIntegrationAdminSession({ app, registry });
      const forbidden = await app.request("/admin/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
          Origin: "https://evil.integration.test",
          [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
        },
        body: JSON.stringify(projectCreateBody("forbidden-admin-project"))
      });
      expect(forbidden.status).toBe(403);
      expect(await readIntegrationJson(forbidden)).toMatchObject({
        error: "forbidden_origin"
      });
    } finally {
      await close();
    }
  });

  test("creates, lists, and updates realms through the admin API", async () => {
    const { app, registry, close } = await createIntegrationApp();

    try {
      const { cookie } = await createIntegrationAdminSession({
        app,
        registry,
        email: "project-admin@integration.test"
      });
      const created = await app.request("/admin/api/projects", {
        method: "POST",
        headers: adminHeaders(cookie),
        body: JSON.stringify(projectCreateBody("admin-created-project"))
      });
      expect(created.status).toBe(201);
      expect(await readIntegrationJson(created)).toMatchObject({
        project: {
          slug: "admin-created-project",
          name: "Admin Created Project",
          appUrl: "https://admin-created-project.integration.test"
        }
      });

      const listed = await app.request("/admin/api/projects", {
        headers: {
          Cookie: cookie,
          [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
        }
      });
      expect(listed.status).toBe(200);
      expect(await readIntegrationJson(listed)).toMatchObject({
        projects: expect.arrayContaining([
          expect.objectContaining({
            slug: "admin-created-project",
            name: "Admin Created Project"
          })
        ])
      });

      const updated = await app.request(
        "/admin/api/projects/admin-created-project",
        {
          method: "PATCH",
          headers: adminHeaders(cookie),
          body: JSON.stringify({
            name: "Updated Admin Project",
            description: "Updated from the admin API integration test",
            iconUrl: "https://cdn.example.test/admin-created-project.png",
            appUrl: "https://updated-admin-project.integration.test",
            trustedOrigins: ["https://updated-admin-project.integration.test"],
            features: {
              passkey: { enabled: true },
              twoFactor: {
                enabled: true,
                required: RealmTwoFactorRequirement.Optional
              },
              agentAuth: {
                enabled: true,
                mode: RealmAgentAuthMode.ReadOnly
              },
              oauthProvider: {
                enabled: true,
                dynamicClientRegistration: false
              }
            }
          })
        }
      );
      expect(updated.status).toBe(200);
      expect(await readIntegrationJson(updated)).toMatchObject({
        project: {
          slug: "admin-created-project",
          name: "Updated Admin Project",
          iconUrl: "https://cdn.example.test/admin-created-project.png",
          features: {
            passkey: { enabled: true },
            twoFactor: { enabled: true },
            agentAuth: { enabled: true },
            oauthProvider: { enabled: true }
          }
        }
      });
    } finally {
      await close();
    }
  });

  test("keeps the winning realm schema when duplicate creates race", async () => {
    const { app, registry, close } = await createIntegrationApp();

    try {
      const { cookie } = await createIntegrationAdminSession({
        app,
        registry,
        email: "race-admin@integration.test"
      });
      const create = () =>
        app.request("/admin/api/projects", {
          method: "POST",
          headers: adminHeaders(cookie),
          body: JSON.stringify(projectCreateBody("concurrent-project"))
        });

      const responses = await Promise.all([create(), create()]);
      expect(responses.map((response) => response.status).sort()).toEqual([
        201,
        409
      ]);

      const registered = registry.get("concurrent-project");
      expect(registered).not.toBeNull();
      const sessionResponse = await registered?.auth.handler(
        new Request(
          `${integrationPublicBaseUrl}/api/concurrent-project/auth/get-session`
        )
      );
      expect(sessionResponse?.status).toBe(200);
    } finally {
      await close();
    }
  });

  test("updates platform delivery and observability settings through the admin API", async () => {
    const { app, registry, close } = await createIntegrationApp();

    try {
      const { cookie } = await createIntegrationAdminSession({
        app,
        registry,
        email: "settings-admin@integration.test"
      });
      const delivery = await app.request("/admin/api/delivery-settings", {
        method: "PATCH",
        headers: adminHeaders(cookie),
        body: JSON.stringify({
          provider: EmailProvider.Resend,
          from: "Auth <auth@example.test>",
          cloudflareAccountId: "",
          resendApiKey: "re_admin_settings_key"
        })
      });
      expect(delivery.status).toBe(200);
      expect(await readIntegrationJson(delivery)).toMatchObject({
        settings: {
          provider: EmailProvider.Resend,
          from: "Auth <auth@example.test>",
          resendApiKeyConfigured: true
        }
      });

      const deliveryRead = await app.request("/admin/api/delivery-settings", {
        headers: {
          Cookie: cookie,
          [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
        }
      });
      expect(deliveryRead.status).toBe(200);
      expect(await readIntegrationJson(deliveryRead)).toMatchObject({
        settings: {
          provider: EmailProvider.Resend,
          resendApiKeyConfigured: true
        }
      });

      const observability = await app.request(
        "/admin/api/observability-settings",
        {
          method: "PATCH",
          headers: adminHeaders(cookie),
          body: JSON.stringify({
            provider: ObservabilityProvider.Sentry,
            enabled: true,
            dsn: "https://public@example.ingest.sentry.io/1",
            environment: "integration"
          })
        }
      );
      expect(observability.status).toBe(200);
      expect(await readIntegrationJson(observability)).toMatchObject({
        settings: {
          provider: ObservabilityProvider.Sentry,
          enabled: true,
          dsnConfigured: true,
          environment: "integration"
        }
      });

      const publicConfig = await app.request("/admin/api/observability-config", {
        headers: {
          [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
        }
      });
      expect(publicConfig.status).toBe(200);
      expect(await readIntegrationJson(publicConfig)).toMatchObject({
        observability: {
          enabled: true,
          dsn: "https://public@example.ingest.sentry.io/1",
          environment: "integration"
        }
      });
    } finally {
      await close();
    }
  });
});

const adminHeaders = (cookie: string) => {
  return {
    "Content-Type": "application/json",
    Cookie: cookie,
    Origin: "http://127.0.0.1:3000",
    [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
  };
};

const projectCreateBody = (slug: string) => {
  return {
    slug,
    name: "Admin Created Project",
    description: "Created from the admin API integration test",
    iconUrl: "",
    appUrl: `https://${slug}.integration.test`,
    trustedOrigins: [`https://${slug}.integration.test`]
  };
};
