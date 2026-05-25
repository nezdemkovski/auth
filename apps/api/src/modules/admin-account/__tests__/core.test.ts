import { describe, expect, test } from "bun:test";
import { Pool } from "pg";

import { EmailProvider } from "../../../email/sender";
import type { AdminSession } from "../../../http/admin/shared";
import {
  AdminAccountService,
  AdminAccountServiceError
} from "../core";

const session: AdminSession = {
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

const createStore = () => {
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

const createAuth = (passwordValid: boolean) => {
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

describe("admin account service", () => {
  test("does not start an email change when delivery is disabled", async () => {
    const { store, updatedProfiles } = createStore();
    const { auth, verifiedPasswords, emailChanges } = createAuth(true);
    const service = new AdminAccountService({
      publicBaseUrl: "https://auth.example.com",
      getDeliverySettings: () => ({ provider: EmailProvider.None }),
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
    const { store, updatedProfiles } = createStore();
    const { auth, verifiedPasswords, emailChanges } = createAuth(true);
    const service = new AdminAccountService({
      publicBaseUrl: "https://auth.example.com",
      getDeliverySettings: () => ({
        provider: EmailProvider.Resend,
        from: "Auth <auth@example.com>",
        apiKey: "re_test"
      }),
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
    const { store, updatedProfiles } = createStore();
    const { auth, verifiedPasswords, emailChanges } = createAuth(false);
    const service = new AdminAccountService({
      publicBaseUrl: "https://auth.example.com",
      getDeliverySettings: () => ({
        provider: EmailProvider.Resend,
        from: "Auth <auth@example.com>",
        apiKey: "re_test"
      }),
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

  test("revokes other sessions and clears the bootstrap password flag after password change", async () => {
    const { store, changedPasswords } = createStore();
    const { auth, passwordChanges } = createAuth(true);
    const service = new AdminAccountService({
      publicBaseUrl: "https://auth.example.com",
      getDeliverySettings: () => ({ provider: EmailProvider.None }),
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
