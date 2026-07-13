import { expect, test, type Page } from "@playwright/test";

const adminUser = {
  id: "admin_123",
  email: "admin@example.com",
  name: "Admin"
};

const mockAdminObservability = async (page: Page) => {
  await page.route("**/admin/api/observability-config", (route) =>
    route.fulfill({
      json: {
        observability: {
          enabled: false,
          dsn: "",
          environment: "test"
        }
      }
    })
  );
};

test("hosted login fails visibly and removes credentials from the browser URL", async ({ page }) => {
  await page.route("**/api/demo/login/config/login**", (route) => route.abort("failed"));

  await page.goto(
    "http://127.0.0.1:5174/login/demo?token=reset-secret&code=oauth-secret&state=public-state"
  );

  await expect(page.getByText("Cannot start.")).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.has("token")).toBe(false);
  expect(new URL(page.url()).searchParams.has("code")).toBe(false);
  expect(new URL(page.url()).searchParams.has("state")).toBe(false);
});

test("bootstrap admin cannot enter the dashboard before changing the temporary password", async ({
  page
}) => {
  let passwordChanged = false;
  await mockAdminObservability(page);
  await page.route("**/admin/api/me", (route) =>
    route.fulfill({
      json: {
        user: adminUser,
        mustChangePassword: !passwordChanged,
        emailServiceEnabled: false
      }
    })
  );
  await page.route("**/admin/api/change-password", (route) => {
    passwordChanged = true;
    return route.fulfill({ status: 204 });
  });
  await page.route("**/admin/api/projects", (route) =>
    route.fulfill({ json: { projects: [] } })
  );

  await page.goto("http://127.0.0.1:5173/admin/");

  await expect(page.getByRole("heading", { name: /Set a new password/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Overview/ })).not.toBeVisible();
  await page.getByLabel("Temporary password").fill("temporary-password-123");
  await page.getByLabel("New password", { exact: true }).fill("replacement-password-456");
  await page.getByLabel("Confirm new password").fill("replacement-password-456");
  await page.getByRole("button", { name: /Save password/ }).click();

  await expect(page.getByRole("heading", { name: /Overview/ })).toBeVisible();
});

test("a protected admin API 401 clears the shell and returns to sign in", async ({ page }) => {
  await mockAdminObservability(page);
  await page.route("**/admin/api/me", (route) =>
    route.fulfill({
      json: {
        user: adminUser,
        mustChangePassword: false,
        emailServiceEnabled: false
      }
    })
  );
  await page.route("**/admin/api/projects", (route) => route.fulfill({ status: 401 }));

  await page.goto("http://127.0.0.1:5173/admin/");

  await expect(page.getByRole("heading", { name: /Sign in/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Overview/ })).not.toBeVisible();
});

test("admin connects an app without exposing auth internals", async ({
  page
}) => {
  const connections: Array<Record<string, unknown>> = [];
  let createBody = "";
  await mockAdminObservability(page);
  await page.route("**/admin/api/me", (route) =>
    route.fulfill({
      json: {
        user: adminUser,
        mustChangePassword: false,
        emailServiceEnabled: false
      }
    })
  );
  await page.route("**/admin/api/projects", (route) =>
    route.fulfill({
      json: {
        projects: [
          {
            slug: "demo",
            name: "Demo App",
            schema: "auth_demo",
            description: "",
            iconUrl: "",
            appUrl: "https://demo.example.com",
            trustedOrigins: ["https://demo.example.com"],
            features: {
              passkey: { enabled: false },
              twoFactor: { enabled: false, required: "optional" },
              agentAuth: { enabled: false, mode: "read-only" },
              oauthProvider: {
                enabled: false,
                dynamicClientRegistration: false
              }
            },
            socialProviders: [],
            system: false,
            userCount: 0,
            activeSessionCount: 0
          }
        ]
      }
    })
  );
  await page.route("**/admin/api/projects/demo/users", (route) =>
    route.fulfill({ json: { users: [] } })
  );
  await page.route("**/admin/api/projects/demo/social-providers", (route) =>
    route.fulfill({ json: { providers: [], catalog: [] } })
  );
  await page.route("**/admin/api/projects/demo/billing", (route) =>
    route.fulfill({ status: 500 })
  );
  await page.route("**/admin/api/projects/demo/storage", (route) =>
    route.fulfill({ status: 500 })
  );
  await page.route("**/admin/api/projects/demo/auth-connections", async (route) => {
    if (route.request().method() === "POST") {
      createBody = route.request().postData() ?? "";
      const connection = {
        clientId: "demo-client",
        name: "Demo product backend",
        kind: "application",
        callbackUrl:
          "https://api.demo.example.com/api/auth/oauth2/callback/auth-platform",
        permissions: [],
        disabled: false,
        canRotateCredential: true,
        createdAt: "2026-07-13T00:00:00.000Z",
        updatedAt: "2026-07-13T00:00:00.000Z"
      };
      connections.push(connection);
      return route.fulfill({
        status: 201,
        json: {
          connection,
          credential: {
            clientId: "demo-client",
            clientSecret: "demo-secret"
          }
        }
      });
    }
    return route.fulfill({
      json: {
        connections,
        catalog: {
          servicePermissions: [
            {
              id: "billing_usage_write",
              name: "Record billing usage",
              description: "Allow a trusted backend to manage user quotas."
            }
          ]
        }
      }
    });
  });

  await page.goto("http://127.0.0.1:5173/admin/projects/demo");

  await expect(
    page.getByRole("heading", { name: "Connect your app" })
  ).toBeVisible();
  await expect(page.getByLabel("Client profile")).not.toBeVisible();
  await expect(page.getByLabel(/Scopes/)).not.toBeVisible();
  await expect(page.getByLabel(/Resources/)).not.toBeVisible();
  await expect(page.getByText("Skip consent")).not.toBeVisible();
  await expect(page.getByLabel("Backend URL")).not.toBeVisible();
  await expect(page.getByText("Better Auth")).not.toBeVisible();
  await expect(page.getByText("MCP discovery")).not.toBeVisible();
  await expect(page.getByText("Billing worker")).not.toBeVisible();
  await expect(page.getByText("Passkeys", { exact: true })).not.toBeVisible();
  await expect(page.getByLabel("Allowed app addresses")).not.toBeVisible();

  await page.getByRole("button", { name: "Connect app" }).click();

  await expect(page.getByText("Demo App app is ready")).toBeVisible();
  await expect(page.getByText("AUTH_CLIENT_ID=demo-client", { exact: false })).toBeVisible();
  await expect(page.getByText("AUTH_CLIENT_SECRET=demo-secret", { exact: false })).toBeVisible();
  expect(createBody).toBe(
    '{"kind":"application","name":"Demo App app","backendUrl":"https://demo.example.com"}'
  );
  expect(createBody).not.toContain("scopes");
  expect(createBody).not.toContain("resources");
});

test("creating a realm returns one copy-ready setup block", async ({ page }) => {
  let createBody = "";
  await mockAdminObservability(page);
  await page.route("**/admin/api/me", (route) =>
    route.fulfill({
      json: {
        user: adminUser,
        mustChangePassword: false,
        emailServiceEnabled: false
      }
    })
  );
  await page.route("**/admin/api/projects", async (route) => {
    if (route.request().method() === "POST") {
      createBody = route.request().postData() ?? "";
      return route.fulfill({
        status: 201,
        json: {
          project: {
            slug: "demo-app",
            name: "Demo App",
            schema: "demo_app_auth",
            description: "",
            iconUrl: "",
            appUrl: "https://app.demo.example.com",
            trustedOrigins: ["https://app.demo.example.com"],
            features: {
              passkey: { enabled: false },
              twoFactor: { enabled: false, required: "optional" },
              agentAuth: { enabled: false, mode: "read-only" },
              oauthProvider: {
                enabled: true,
                dynamicClientRegistration: false
              }
            },
            socialProviders: [],
            system: false,
            userCount: 0,
            activeSessionCount: 0
          },
          setup: {
            issuer: "https://auth.example.com/api/demo-app",
            callbackUrl:
              "https://api.demo.example.com/api/auth/oauth2/callback/auth-platform",
            clientId: "demo-client",
            clientSecret: "demo-secret",
            mcp: {
              authorizationServer: "https://auth.example.com/api/demo-app",
              discoveryUrl:
                "https://auth.example.com/api/demo-app/.well-known/oauth-authorization-server"
            }
          }
        }
      });
    }
    return route.fulfill({ json: { projects: [] } });
  });

  await page.goto("http://127.0.0.1:5173/admin/projects/new");

  await page.getByLabel("App name").fill("Demo App");
  await page.getByLabel("App address").fill("https://app.demo.example.com");
  await expect(page.getByLabel("Backend URL")).not.toBeVisible();
  await expect(page.getByText("Better Auth")).not.toBeVisible();
  await page.getByRole("button", { name: "Create app" }).click();

  await expect(
    page.getByRole("heading", { name: /Copy\. Paste\. Done\./ })
  ).toBeVisible();
  await expect(
    page.getByText("AUTH_ISSUER=https://auth.example.com/api/demo-app", {
      exact: false
    })
  ).toBeVisible();
  await expect(
    page.getByText("AUTH_CLIENT_SECRET=demo-secret", { exact: false })
  ).toBeVisible();
  await expect(page.getByText("MCP access is ready.")).toBeVisible();
  expect(createBody).toBe(
    '{"slug":"demo-app","name":"Demo App","appUrl":"https://app.demo.example.com","backendUrl":"https://app.demo.example.com"}'
  );
});
