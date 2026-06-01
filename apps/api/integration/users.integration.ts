import { beforeEach, describe, expect, test } from "bun:test";

import {
  createIntegrationApp,
  resetAndBootstrapIntegrationDatabase,
  signUpIntegrationUser
} from "./setup";
import { seedIntegrationRealm } from "./seed";
import {
  readProjectCounts,
  readProjectUsers,
  terminateUserSessions
} from "../src/modules/users/store";

describe("users integration", () => {
  beforeEach(async () => {
    await resetAndBootstrapIntegrationDatabase();
  });

  test("lists users and terminates only the selected user's active sessions", async () => {
    const project = await seedIntegrationRealm({
      slug: "integration-users",
      schema: "integration_users_auth",
      name: "Integration Users"
    });
    const { app, registry, close } = await createIntegrationApp();

    try {
      const first = await signUpIntegrationUser({
        app,
        projectSlug: project.slug,
        origin: project.appUrl,
        email: "first-user@integration.test",
        password: "correct horse battery staple",
        name: "First User"
      });
      const second = await signUpIntegrationUser({
        app,
        projectSlug: project.slug,
        origin: project.appUrl,
        email: "second-user@integration.test",
        password: "correct horse battery staple",
        name: "Second User"
      });
      const registered = registry.get(project.slug);
      if (!registered) {
        throw new Error("Expected integration realm to be registered");
      }

      await expect(readProjectCounts(registered.projectDb.pool)).resolves.toEqual({
        userCount: 2,
        activeSessionCount: 2
      });
      await expect(readProjectUsers(registered.projectDb.pool)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: first.userId,
            email: "first-user@integration.test",
            name: "First User",
            sessionCount: 1
          }),
          expect.objectContaining({
            id: second.userId,
            email: "second-user@integration.test",
            name: "Second User",
            sessionCount: 1
          })
        ])
      );

      await expect(
        terminateUserSessions(registered.projectDb.pool, first.userId)
      ).resolves.toBe(1);
      await expect(readProjectCounts(registered.projectDb.pool)).resolves.toEqual({
        userCount: 2,
        activeSessionCount: 1
      });
      await expect(readProjectUsers(registered.projectDb.pool)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: first.userId,
            sessionCount: 0
          }),
          expect.objectContaining({
            id: second.userId,
            sessionCount: 1
          })
        ])
      );
    } finally {
      await close();
    }
  });
});
