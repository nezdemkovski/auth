import type { RegisteredProject } from "../../auth/registry";
import type { AuthProject } from "../../config/projects";
import { EmailProvider, type EmailConfig } from "../../email/sender";
import {
  readProjectUsers,
  terminateUserSessions
} from "./store";
import {
  projectUserResponse,
  usersProjectResponse
} from "./translator";

export class UsersServiceError extends Error {
  constructor(
    readonly code: string,
    readonly status: 409,
    message = code
  ) {
    super(message);
    this.name = "UsersServiceError";
  }
}

export class UsersService {
  constructor(
    private readonly options: {
      adminProject: AuthProject;
      getDeliverySettings(): EmailConfig;
    }
  ) {}

  async listUsers(registered: RegisteredProject) {
    const users = await readProjectUsers(registered.projectDb.pool);

    return {
      project: usersProjectResponse(registered.project, this.options.adminProject),
      users: users.map(projectUserResponse)
    };
  }

  async terminateSessions(registered: RegisteredProject, userId: string) {
    return terminateUserSessions(registered.projectDb.pool, userId);
  }

  async resendVerification(registered: RegisteredProject, email: string): Promise<void> {
    if (this.options.getDeliverySettings().provider === EmailProvider.None) {
      throw new UsersServiceError(
        "email_service_disabled",
        409,
        "Email service is disabled"
      );
    }

    await sendVerificationEmail(registered.auth, {
      email,
      callbackURL: registered.project.trustedOrigins[0]
    });
  }
}

async function sendVerificationEmail(
  auth: unknown,
  body: {
    email: string;
    callbackURL?: string;
  }
): Promise<unknown> {
  const api = (auth as {
    api: {
      sendVerificationEmail(input: {
        body: {
          email: string;
          callbackURL?: string;
        };
      }): Promise<unknown>;
    };
  }).api;

  return api.sendVerificationEmail({ body });
}
