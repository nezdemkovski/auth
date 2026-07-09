import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(process.env.CI ? {} : { channel: "chrome" })
  },
  webServer: [
    {
      command: "bun run --cwd apps/admin dev -- --host 127.0.0.1 --port 5173",
      url: "http://127.0.0.1:5173/admin/",
      reuseExistingServer: !process.env.CI
    },
    {
      command: "bun run --cwd apps/login dev",
      url: "http://127.0.0.1:5174/login/",
      reuseExistingServer: !process.env.CI
    }
  ]
});
