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

test("admin creates an OAuth client and receives copy-ready environment variables", async ({
  page
}) => {
  const clients: Array<Record<string, unknown>> = [];
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
                enabled: true,
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
  await page.route("**/admin/api/projects/demo/oauth-clients", async (route) => {
    if (route.request().method() === "POST") {
      const client = {
        clientId: "demo-client",
        name: "Demo product backend",
        profile: "web",
        redirectUris: [
          "https://api.demo.example.com/api/auth/oauth2/callback/auth-platform"
        ],
        postLogoutRedirectUris: [],
        scopes: ["openid", "profile", "email", "offline_access"],
        resources: [],
        disabled: false,
        public: false,
        skipConsent: true,
        requirePkce: true,
        secretConfigured: true,
        createdAt: "2026-07-13T00:00:00.000Z",
        updatedAt: "2026-07-13T00:00:00.000Z"
      };
      clients.push(client);
      return route.fulfill({
        status: 201,
        json: {
          client,
          credential: {
            clientId: "demo-client",
            clientSecret: "demo-secret"
          }
        }
      });
    }
    return route.fulfill({ json: { clients } });
  });

  await page.goto("http://127.0.0.1:5173/admin/projects/demo");

  await expect(page.getByRole("heading", { name: "OAuth clients" })).toBeVisible();
  await page.getByLabel("Client name").fill("Demo product backend");
  await page
    .getByLabel(/Redirect URIs/)
    .fill("https://api.demo.example.com/api/auth/oauth2/callback/auth-platform");
  await page.getByRole("button", { name: "Create client" }).click();

  await expect(page.getByText("Credentials for Demo product backend")).toBeVisible();
  await expect(page.getByText("AUTH_CLIENT_ID=demo-client", { exact: false })).toBeVisible();
  await expect(page.getByText("AUTH_CLIENT_SECRET=demo-secret", { exact: false })).toBeVisible();
  await expect(page.getByText("demo-client", { exact: true })).toBeVisible();
});
