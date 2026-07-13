import type { AuthProject } from "../../config/projects";
import {
  readProjectUsers,
  terminateUserSessions
} from "./store";
import {
  projectUserResponse,
  usersProjectResponse
} from "./translator";

type UsersStore = {
  readProjectUsers: typeof readProjectUsers;
  terminateUserSessions: typeof terminateUserSessions;
};

const defaultStore: UsersStore = {
  readProjectUsers,
  terminateUserSessions
};

export type UsersRegisteredProject = {
  project: AuthProject;
  projectDb: {
    pool: Parameters<typeof readProjectUsers>[0];
  };
  auth: {
    api: {
      sendVerificationEmail(input: {
        body: {
          email: string;
          callbackURL?: string;
        };
      }): Promise<unknown>;
    };
  };
};

export class UsersServiceError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 404 | 409,
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
      isDeliveryEnabled(): boolean;
      store?: UsersStore;
    }
  ) {
    this.store = options.store ?? defaultStore;
  }

  private readonly store: UsersStore;

  async listUsers(registered: UsersRegisteredProject) {
    const users = await this.store.readProjectUsers(registered.projectDb.pool);

    return {
      project: usersProjectResponse(registered.project, this.options.adminProject),
      users: users.map(projectUserResponse)
    };
  }

  async terminateSessions(registered: UsersRegisteredProject, userId: string) {
    return this.store.terminateUserSessions(registered.projectDb.pool, userId);
  }

  async resendVerification(registered: UsersRegisteredProject, email: string) {
    if (!this.options.isDeliveryEnabled()) {
      throw new UsersServiceError(
        "email_service_disabled",
        409,
        "Email service is disabled"
      );
    }

    await registered.auth.api.sendVerificationEmail({
      body: {
        email,
        callbackURL: registered.project.trustedOrigins[0]
      }
    });
  }
}
