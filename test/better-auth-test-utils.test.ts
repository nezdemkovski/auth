import { describe, expect, test } from "bun:test";

import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";

describe("Better Auth test utils", () => {
  test("creates an authenticated session in a test-only auth instance", async () => {
    const auth = betterAuth({
      baseURL: "http://localhost:3000/api/auth",
      secret: "test-secret-for-better-auth-utils-0123456789",
      emailAndPassword: {
        enabled: true
      },
      plugins: [testUtils()],
      rateLimit: {
        enabled: false
      },
      telemetry: {
        enabled: false
      }
    });
    const ctx = await auth.$context;
    const user = ctx.test.createUser({
      email: "integration@example.com",
      name: "Integration User",
      emailVerified: true
    });

    await ctx.test.saveUser(user);
    const { headers } = await ctx.test.login({
      userId: user.id
    });
    const session = await auth.api.getSession({
      headers
    });

    expect(session?.user.email).toBe("integration@example.com");

    await ctx.test.deleteUser(user.id);
  });
});
