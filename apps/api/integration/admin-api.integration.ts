import { beforeEach, describe, expect, test } from "bun:test";

import {
  createIntegrationAdminSession,
  createIntegrationApp,
  readIntegrationJson,
  resetAndBootstrapIntegrationDatabase
} from "./setup";
import { DIRECT_CLIENT_IP_HEADER } from "../src/http/security";
import {
  ProjectAgentAuthMode,
  ProjectTwoFactorRequirement,
  ObservabilityProvider
} from "../src/config/projects";
import { EmailProvider } from "../src/email/sender";

describe("admin API integration", () => {
  beforeEach(async () => {
    await resetAndBootstrapIntegrationDatabase();
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
                required: ProjectTwoFactorRequirement.Optional
              },
              agentAuth: {
                enabled: true,
                mode: ProjectAgentAuthMode.ReadOnly
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
