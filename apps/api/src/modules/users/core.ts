import type { IdentityAuth, IdentityService } from "@nezdemkovski/auth-identity";
import type { Pool } from "pg";

import type { AuthProject } from "../../config/projects";
import { usersProjectResponse } from "./translator";

export type UsersRegisteredProject = {
  project: AuthProject;
  projectDb: {
    pool: Pool;
  };
  auth: IdentityAuth;
};

export class UsersService {
  constructor(
    private readonly options: {
      adminProject: AuthProject;
      identity: IdentityService;
    }
  ) {}

  async listUsers(registered: UsersRegisteredProject) {
    return {
      project: usersProjectResponse(registered.project, this.options.adminProject),
      users: await this.options.identity.listUsers(registered.projectDb.pool)
    };
  }

  async terminateSessions(registered: UsersRegisteredProject, userId: string) {
    return this.options.identity.terminateSessions(registered.projectDb.pool, userId);
  }

  async resendVerification(registered: UsersRegisteredProject, email: string) {
    await this.options.identity.resendVerification({
      auth: registered.auth,
      email,
      callbackURL: registered.project.trustedOrigins[0]
    });
  }
}
