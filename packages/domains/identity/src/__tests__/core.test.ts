import { describe, expect, test } from "bun:test";
import { Pool } from "pg";

import {
  AdminAccountService,
  AdminAccountServiceError,
  IdentityService
} from "../core";

const session = {
  user: {
    id: "admin-user",
    email: "admin@example.com",
    name: "Admin",
    role: "admin"
  },
  session: {
    id: "admin-session"
  }
};

const createAdminStore = () => {
  const updatedProfiles: { userId: string; patch: { name?: string } }[] = [];
  const changedPasswords: string[] = [];

  return {
    updatedProfiles,
    changedPasswords,
    store: {
      mustChangePassword: async () => false,
      updateAdminProfile: async (_pool: Pool, userId: string, patch: { name?: string }) => {
        updatedProfiles.push({ userId, patch });
      },
      markPasswordChanged: async (_pool: Pool, userId: string) => {
        changedPasswords.push(userId);
      }
    }
  };
};

const createAdminAuth = (passwordValid: boolean) => {
  const verifiedPasswords: string[] = [];
  const emailChanges: { newEmail: string; callbackURL: string }[] = [];
  const passwordChanges: {
    currentPassword: string;
    newPassword: string;
    revokeOtherSessions: boolean;
  }[] = [];

  return {
    verifiedPasswords,
    emailChanges,
    passwordChanges,
    auth: {
      api: {
        verifyPassword: async (input: { body: { password: string } }) => {
          verifiedPasswords.push(input.body.password);
          return { status: passwordValid };
        },
        changeEmail: async (input: {
          body: {
            newEmail: string;
            callbackURL: string;
          };
        }) => {
          emailChanges.push(input.body);
          return { ok: true };
        },
        changePassword: async (input: {
          body: {
            currentPassword: string;
            newPassword: string;
            revokeOtherSessions: boolean;
          };
        }) => {
          passwordChanges.push(input.body);
          return { ok: true };
        }
      }
    }
  };
};

describe("identity service", () => {
  test("keeps delivery policy outside the Better Auth verification API", async () => {
    const verificationEmails: { email: string; callbackURL?: string }[] = [];
    const auth = {
      api: {
        sendVerificationEmail: async (input: {
          body: { email: string; callbackURL?: string };
        }) => {
          verificationEmails.push(input.body);
        }
      }
    };
    const disabled = new IdentityService({ isDeliveryEnabled: () => false });

    await expect(
      disabled.resendVerification({
        auth,
        email: "user@example.com",
        callbackURL: "https://demo.example.com"
      })
    ).rejects.toMatchObject({
      code: "email_service_disabled",
      status: 409
    });
    expect(verificationEmails).toEqual([]);

    const enabled = new IdentityService({ isDeliveryEnabled: () => true });
    await enabled.resendVerification({
      auth,
      email: "user@example.com",
      callbackURL: "https://demo.example.com"
    });
    expect(verificationEmails).toEqual([
      {
        email: "user@example.com",
        callbackURL: "https://demo.example.com"
      }
    ]);
  });

  test("maps Better Auth users and terminates sessions through the identity store", async () => {
    const terminatedUsers: string[] = [];
    const service = new IdentityService({
      isDeliveryEnabled: () => false,
      store: {
        readIdentityUsers: async () => [
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
        terminateIdentitySessions: async (_pool: Pool, userId: string) => {
          terminatedUsers.push(userId);
          return 3;
        }
      }
    });
    const pool = new Pool();

    await expect(service.listUsers(pool)).resolves.toEqual([
      {
        id: "user-id",
        email: "user@example.com",
        name: "User",
        role: null,
        banned: false,
        emailVerified: true,
        createdAt: "2026-05-25T10:00:00.000Z",
        updatedAt: "2026-05-25T11:00:00.000Z",
        sessionCount: 2
      }
    ]);
    await expect(service.terminateSessions(pool, "user-id")).resolves.toBe(3);
    expect(terminatedUsers).toEqual(["user-id"]);
  });
});

describe("admin account service", () => {
  test("does not start an email change when delivery is disabled", async () => {
    const { store, updatedProfiles } = createAdminStore();
    const { auth, verifiedPasswords, emailChanges } = createAdminAuth(true);
    const service = new AdminAccountService({
      publicBaseUrl: "https://auth.example.com",
      isDeliveryEnabled: () => false,
      store
    });

    await expect(
      service.updateProfile({
        auth,
        headers: new Headers(),
        projectDb: { pool: new Pool() },
        session,
        patch: { email: "next@example.com" },
        currentPassword: "current-password"
      })
    ).rejects.toBeInstanceOf(AdminAccountServiceError);

    expect(verifiedPasswords).toEqual([]);
    expect(updatedProfiles).toEqual([]);
    expect(emailChanges).toEqual([]);
  });

  test("verifies the current password before requesting an admin email change", async () => {
    const { store, updatedProfiles } = createAdminStore();
    const { auth, verifiedPasswords, emailChanges } = createAdminAuth(true);
    const service = new AdminAccountService({
      publicBaseUrl: "https://auth.example.com",
      isDeliveryEnabled: () => true,
      store
    });

    await service.updateProfile({
      auth,
      headers: new Headers(),
      projectDb: { pool: new Pool() },
      session,
      patch: {
        name: "Admin User",
        email: "next@example.com"
      },
      currentPassword: "current-password"
    });

    expect(verifiedPasswords).toEqual(["current-password"]);
    expect(updatedProfiles).toEqual([
      {
        userId: "admin-user",
        patch: {
          name: "Admin User"
        }
      }
    ]);
    expect(emailChanges).toEqual([
      {
        newEmail: "next@example.com",
        callbackURL: "https://auth.example.com/admin/settings"
      }
    ]);
  });

  test("does not save profile changes when the current password is wrong", async () => {
    const { store, updatedProfiles } = createAdminStore();
    const { auth, verifiedPasswords, emailChanges } = createAdminAuth(false);
    const service = new AdminAccountService({
      publicBaseUrl: "https://auth.example.com",
      isDeliveryEnabled: () => true,
      store
    });

    await expect(
      service.updateProfile({
        auth,
        headers: new Headers(),
        projectDb: { pool: new Pool() },
        session,
        patch: {
          name: "Admin User",
          email: "next@example.com"
        },
        currentPassword: "wrong-password"
      })
    ).rejects.toMatchObject({
      code: "invalid_password",
      status: 401
    });

    expect(verifiedPasswords).toEqual(["wrong-password"]);
    expect(updatedProfiles).toEqual([]);
    expect(emailChanges).toEqual([]);
  });

  test("revokes other sessions and clears the bootstrap flag after password change", async () => {
    const { store, changedPasswords } = createAdminStore();
    const { auth, passwordChanges } = createAdminAuth(true);
    const service = new AdminAccountService({
      publicBaseUrl: "https://auth.example.com",
      isDeliveryEnabled: () => false,
      store
    });

    await service.changePassword({
      auth,
      headers: new Headers(),
      projectDb: { pool: new Pool() },
      session,
      password: {
        currentPassword: "old-password",
        newPassword: "new-strong-password"
      }
    });

    expect(passwordChanges).toEqual([
      {
        currentPassword: "old-password",
        newPassword: "new-strong-password",
        revokeOtherSessions: true
      }
    ]);
    expect(changedPasswords).toEqual(["admin-user"]);
  });
});
