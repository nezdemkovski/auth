import { EmailProvider, type EmailConfig } from "../../email/sender";
import type { RegisteredProject } from "../../auth/registry";
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
    auth: RegisteredProject["auth"];
    headers: Headers;
    projectDb: { pool: Parameters<typeof updateAdminProfile>[0] };
    session: AdminSession;
    patch: AdminProfilePatch;
    currentPassword: string | null;
  }) {
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
    auth: RegisteredProject["auth"];
    headers: Headers;
    projectDb: { pool: Parameters<typeof markPasswordChanged>[0] };
    session: AdminSession;
    password: ChangePasswordInput;
  }) {
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

const changePassword = async (auth: RegisteredProject["auth"], headers: Headers, body: {
    currentPassword: string;
    newPassword: string;
  }) => {
  return auth.api.changePassword({
    headers,
    body: {
      ...body,
      revokeOtherSessions: true
    }
  });
};

const verifyPassword = async (auth: RegisteredProject["auth"], headers: Headers, password: string) => {
  const result = await auth.api
    .verifyPassword({
      headers,
      body: {
        password
      }
    })
    .catch(() => null);

  return result?.status === true;
};

const changeEmail = async (auth: RegisteredProject["auth"], headers: Headers, body: {
    newEmail: string;
    callbackURL: string;
  }) => {
  return auth.api.changeEmail({
    headers,
    body
  });
};
