import { describe, expect, test } from "bun:test";
import { Pool } from "pg";

import {
  ADMIN_PROJECT,
  DEFAULT_PROJECT_BILLING,
  DEFAULT_PROJECT_FEATURES,
  DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  DEFAULT_PROJECT_STORAGE,
  type AuthProject
} from "../../../config/projects";
import { UsersService } from "../core";

const project: AuthProject = {
  slug: "demo",
  name: "Demo App",
  schema: "demo_auth",
  description: "",
  iconUrl: "",
  appUrl: "",
  trustedOrigins: ["https://demo.example.com"],
  features: DEFAULT_PROJECT_FEATURES,
  socialProviders: DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  billing: DEFAULT_PROJECT_BILLING,
  storage: DEFAULT_PROJECT_STORAGE
};

const createRegistered = () => {
  const verificationEmails: { email: string; callbackURL?: string }[] = [];

  return {
    verificationEmails,
    registered: {
      project,
      projectDb: {
        pool: new Pool()
      },
      auth: {
        api: {
          sendVerificationEmail: async (input: {
            body: {
              email: string;
              callbackURL?: string;
            };
          }) => {
            verificationEmails.push(input.body);
          }
        }
      }
    }
  };
};

const createStore = () => {
  const terminatedUsers: string[] = [];

  return {
    terminatedUsers,
    store: {
      readProjectUsers: async () => [
        {
          id: "user-id",
          email: "user@example.com",
          name: "User",
          role: null,
          banned: null,
          emailVerified: true,
          createdAt: new Date("2026-05-25T10:00:00.000Z"),
          updatedAt: new Date("2026-05-25T11:00:00.000Z"),
          sessionCount: 2
        }
      ],
      terminateUserSessions: async (_pool: Pool, userId: string) => {
        terminatedUsers.push(userId);
        return 3;
      }
    }
  };
};

describe("users core", () => {
  test("refuses verification email resend when delivery is disabled", async () => {
    const { registered, verificationEmails } = createRegistered();
    const service = new UsersService({
      adminProject: registered.project,
      isDeliveryEnabled: () => false,
      store: createStore().store
    });

    await expect(
      service.resendVerification(registered, "user@example.com")
    ).rejects.toMatchObject({
      code: "email_service_disabled",
      status: 409
    });
    expect(verificationEmails).toEqual([]);
  });

  test("resends verification email through the project auth API", async () => {
    const { registered, verificationEmails } = createRegistered();
    const service = new UsersService({
      adminProject: registered.project,
      isDeliveryEnabled: () => true,
      store: createStore().store
    });

    await service.resendVerification(registered, "user@example.com");

    expect(verificationEmails).toEqual([
      {
        email: "user@example.com",
        callbackURL: "https://demo.example.com"
      }
    ]);
  });

  test("lists users and terminates active sessions through the project store", async () => {
    const { registered } = createRegistered();
    const { store, terminatedUsers } = createStore();
    const service = new UsersService({
      adminProject: ADMIN_PROJECT,
      isDeliveryEnabled: () => false,
      store
    });

    await expect(service.listUsers(registered)).resolves.toMatchObject({
      project: {
        slug: "demo",
        system: false
      },
      users: [
        {
          id: "user-id",
          email: "user@example.com",
          sessionCount: 2
        }
      ]
    });
    await expect(
      service.terminateSessions(registered, "user-id")
    ).resolves.toBe(3);
    expect(terminatedUsers).toEqual(["user-id"]);
  });
});
