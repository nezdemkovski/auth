import { EmailProvider, type EmailConfig } from "../../email/sender";
import type { AdminSession } from "../../http/admin/shared";
import {
  markPasswordChanged,
  mustChangePassword,
  updateAdminProfile,
  type AdminProfilePatch
} from "./store";
import type { ChangePasswordInput } from "./validator";

export class AdminAccountServiceError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 401 | 409,
    message = code
  ) {
    super(message);
    this.name = "AdminAccountServiceError";
  }
}

export class AdminAccountService {
  constructor(
    private readonly options: {
      publicBaseUrl: string;
      getDeliverySettings(): EmailConfig;
    }
  ) {}

  async currentProfile(input: {
    projectDb: { pool: Parameters<typeof mustChangePassword>[0] };
    session: AdminSession;
  }) {
    return {
      user: input.session.user,
      mustChangePassword: await mustChangePassword(
        input.projectDb.pool,
        input.session.user.id
      ),
      emailServiceEnabled: this.options.getDeliverySettings().provider !== EmailProvider.None
    };
  }

  async updateProfile(input: {
    auth: unknown;
    headers: Headers;
    projectDb: { pool: Parameters<typeof updateAdminProfile>[0] };
    session: AdminSession;
    patch: AdminProfilePatch;
    currentPassword: string | null;
  }): Promise<void> {
    const nextEmail = input.patch.email;
    const emailChanged =
      nextEmail !== undefined && nextEmail !== input.session.user.email.toLowerCase();

    if (emailChanged) {
      if (this.options.getDeliverySettings().provider === EmailProvider.None) {
        throw new AdminAccountServiceError(
          "email_service_disabled",
          409,
          "Email service is disabled"
        );
      }
      if (!input.currentPassword) {
        throw new AdminAccountServiceError(
          "current_password_required",
          400,
          "Current password is required"
        );
      }
      if (!(await verifyPassword(input.auth, input.headers, input.currentPassword))) {
        throw new AdminAccountServiceError("invalid_password", 401, "Invalid password");
      }
    }

    try {
      await updateAdminProfile(input.projectDb.pool, input.session.user.id, {
        name: input.patch.name
      });
    } catch (error) {
      if (error instanceof Error && /unique|duplicate/i.test(error.message)) {
        throw new AdminAccountServiceError("email_in_use", 409, "Email is already in use");
      }
      throw error;
    }

    if (emailChanged) {
      await changeEmail(input.auth, input.headers, {
        newEmail: nextEmail,
        callbackURL: `${this.options.publicBaseUrl}/admin/settings`
      });
    }
  }

  async changePassword(input: {
    auth: unknown;
    headers: Headers;
    projectDb: { pool: Parameters<typeof markPasswordChanged>[0] };
    session: AdminSession;
    password: ChangePasswordInput;
  }): Promise<unknown> {
    if (input.password.newPassword.length < 12) {
      throw new AdminAccountServiceError("weak_password", 400, "Password is too weak");
    }

    const response = await changePassword(input.auth, input.headers, {
      currentPassword: input.password.currentPassword,
      newPassword: input.password.newPassword
    });

    await markPasswordChanged(input.projectDb.pool, input.session.user.id);

    return response;
  }
}

async function changePassword(
  auth: unknown,
  headers: Headers,
  body: {
    currentPassword: string;
    newPassword: string;
  }
): Promise<unknown> {
  const api = (auth as {
    api: {
      changePassword(input: {
        headers: Headers;
        body: {
          currentPassword: string;
          newPassword: string;
          revokeOtherSessions: boolean;
        };
      }): Promise<unknown>;
    };
  }).api;

  return api.changePassword({
    headers,
    body: {
      ...body,
      revokeOtherSessions: true
    }
  });
}

async function verifyPassword(
  auth: unknown,
  headers: Headers,
  password: string
): Promise<boolean> {
  const api = (auth as {
    api: {
      verifyPassword(input: {
        headers: Headers;
        body: {
          password: string;
        };
      }): Promise<{ status: boolean }>;
    };
  }).api;

  const result = await api
    .verifyPassword({
      headers,
      body: {
        password
      }
    })
    .catch(() => null);

  return result?.status === true;
}

async function changeEmail(
  auth: unknown,
  headers: Headers,
  body: {
    newEmail: string;
    callbackURL: string;
  }
): Promise<unknown> {
  const api = (auth as {
    api: {
      changeEmail(input: {
        headers: Headers;
        body: {
          newEmail: string;
          callbackURL: string;
        };
      }): Promise<unknown>;
    };
  }).api;

  return api.changeEmail({
    headers,
    body
  });
}
