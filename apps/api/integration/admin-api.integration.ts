import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { EmailProvider } from "@nezdemkovski/auth-delivery";
import { ObservabilityProvider } from "@nezdemkovski/auth-observability";
import { OAuthClientProfile } from "@nezdemkovski/auth-oauth-client-management";
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

  test("manages realm-owned OAuth clients without a realm user owner", async () => {
    const { app, registry, close } = await createIntegrationApp();

    try {
      const { cookie } = await createIntegrationAdminSession({
        app,
        registry,
        email: "oauth-admin@integration.test"
      });
      const projectSlug = "oauth-client-project";
      const createdProject = await app.request("/admin/api/projects", {
        method: "POST",
        headers: adminHeaders(cookie),
        body: JSON.stringify({
          ...projectCreateBody(projectSlug),
          features: {
            oauthProvider: {
              enabled: true,
              dynamicClientRegistration: false
            }
          }
        })
      });
      expect(createdProject.status).toBe(201);

      const billingResource = `${integrationPublicBaseUrl}/api/${projectSlug}/billing`;
      const created = await app.request(
        `/admin/api/projects/${projectSlug}/oauth-clients`,
        {
          method: "POST",
          headers: adminHeaders(cookie),
          body: JSON.stringify({
            name: "Demo Worker",
            profile: OAuthClientProfile.Service,
            scopes: ["billing:usage:write"],
            resources: [billingResource]
          })
        }
      );
      expect(created.status).toBe(201);
      const initialCredential = readOAuthCredential(
        await readIntegrationJson(created)
      );
      expect(initialCredential.clientSecret).toMatch(/^[A-Za-z0-9_-]+$/);

      const listed = await app.request(
        `/admin/api/projects/${projectSlug}/oauth-clients`,
        {
          headers: {
            Cookie: cookie,
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          }
        }
      );
      expect(listed.status).toBe(200);
      const listedBody = await readIntegrationJson(listed);
      expect(listedBody).toMatchObject({
        clients: [
          {
            clientId: initialCredential.clientId,
            name: "Demo Worker",
            profile: OAuthClientProfile.Service,
            resources: [billingResource],
            secretConfigured: true,
            disabled: false
          }
        ]
      });
      expect(JSON.stringify(listedBody)).not.toContain(
        initialCredential.clientSecret
      );

      const updated = await app.request(
        `/admin/api/projects/${projectSlug}/oauth-clients/${initialCredential.clientId}`,
        {
          method: "PATCH",
          headers: adminHeaders(cookie),
          body: JSON.stringify({ name: "Updated Demo Worker" })
        }
      );
      expect(updated.status).toBe(200);
      expect(await readIntegrationJson(updated)).toMatchObject({
        client: {
          clientId: initialCredential.clientId,
          name: "Updated Demo Worker"
        }
      });

      const fetched = await app.request(
        `/admin/api/projects/${projectSlug}/oauth-clients/${initialCredential.clientId}`,
        {
          headers: {
            Cookie: cookie,
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          }
        }
      );
      expect(fetched.status).toBe(200);
      expect(await readIntegrationJson(fetched)).toMatchObject({
        client: {
          clientId: initialCredential.clientId,
          name: "Updated Demo Worker"
        }
      });
      expect(
        await exchangeClientCredentials({
          app,
          projectSlug,
          credential: initialCredential,
          resource: billingResource
        })
      ).toBe(200);

      const rotated = await app.request(
        `/admin/api/projects/${projectSlug}/oauth-clients/${initialCredential.clientId}/rotate-secret`,
        {
          method: "POST",
          headers: adminHeaders(cookie)
        }
      );
      expect(rotated.status).toBe(200);
      const rotatedCredential = readOAuthCredential(
        await readIntegrationJson(rotated)
      );
      expect(rotatedCredential.clientSecret).not.toBe(
        initialCredential.clientSecret
      );
      expect(
        await exchangeClientCredentials({
          app,
          projectSlug,
          credential: initialCredential,
          resource: billingResource
        })
      ).not.toBe(200);
      expect(
        await exchangeClientCredentials({
          app,
          projectSlug,
          credential: rotatedCredential,
          resource: billingResource
        })
      ).toBe(200);

      const disabled = await app.request(
        `/admin/api/projects/${projectSlug}/oauth-clients/${initialCredential.clientId}/disable`,
        {
          method: "POST",
          headers: adminHeaders(cookie)
        }
      );
      expect(disabled.status).toBe(200);
      expect(await readIntegrationJson(disabled)).toMatchObject({
        client: { disabled: true }
      });
      expect(
        await exchangeClientCredentials({
          app,
          projectSlug,
          credential: rotatedCredential,
          resource: billingResource
        })
      ).not.toBe(200);

      const enabled = await app.request(
        `/admin/api/projects/${projectSlug}/oauth-clients/${initialCredential.clientId}/enable`,
        {
          method: "POST",
          headers: adminHeaders(cookie)
        }
      );
      expect(enabled.status).toBe(200);
      expect(await readIntegrationJson(enabled)).toMatchObject({
        client: { disabled: false }
      });
      expect(
        await exchangeClientCredentials({
          app,
          projectSlug,
          credential: rotatedCredential,
          resource: billingResource
        })
      ).toBe(200);

      const deleted = await app.request(
        `/admin/api/projects/${projectSlug}/oauth-clients/${initialCredential.clientId}`,
        {
          method: "DELETE",
          headers: adminHeaders(cookie)
        }
      );
      expect(deleted.status).toBe(204);

      const missing = await app.request(
        `/admin/api/projects/${projectSlug}/oauth-clients/${initialCredential.clientId}`,
        {
          headers: {
            Cookie: cookie,
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          }
        }
      );
      expect(missing.status).toBe(404);
      expect(await readIntegrationJson(missing)).toMatchObject({
        error: "unknown_oauth_client"
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

const readOAuthCredential = (body: Record<string, unknown>) => {
  if (!isRecord(body.credential)) {
    throw new Error("Expected OAuth client credential");
  }
  const clientId = body.credential.clientId;
  const clientSecret = body.credential.clientSecret;
  if (
    typeof clientId !== "string" ||
    typeof clientSecret !== "string" ||
    !clientId ||
    !clientSecret
  ) {
    throw new Error("Expected confidential OAuth client credential");
  }

  return { clientId, clientSecret };
};

const exchangeClientCredentials = async (options: {
  app: Awaited<ReturnType<typeof createIntegrationApp>>["app"];
  projectSlug: string;
  credential: { clientId: string; clientSecret: string };
  resource: string;
}) => {
  const response = await options.app.request(
    `/api/${options.projectSlug}/auth/oauth2/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${options.credential.clientId}:${options.credential.clientSecret}`
        ).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "billing:usage:write",
        resource: options.resource
      }).toString()
    }
  );

  return response.status;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
