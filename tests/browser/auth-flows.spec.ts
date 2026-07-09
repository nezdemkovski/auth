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
