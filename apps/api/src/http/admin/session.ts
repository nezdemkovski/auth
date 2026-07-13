import type { AuthRegistry, RegisteredProject } from "../../auth/registry";
import { projectSessionSatisfiesPolicy } from "@nezdemkovski/auth-better-auth-runtime";
import { mustChangePassword } from "@nezdemkovski/auth-identity";
import {
  ADMIN_PROJECT_SLUG,
  AuthUserRole,
  type AuthProject
} from "../../config/projects";

export type AdminSession = {
  user: {
    id: string;
    email: string;
    name: string;
    role?: string | null;
    twoFactorEnabled?: boolean;
  };
  session: {
    id: string;
  };
};

export const requireAdmin = async (registry: AuthRegistry, headers: Headers) => {
  const registered = registry.get(ADMIN_PROJECT_SLUG);
  if (!registered) {
    return null;
  }

  const session = await getSession(registered.auth, headers);
  if (!session) {
    return null;
  }

  const passwordRotationRequired = await mustChangePassword(
    registered.projectDb.pool,
    session.user.id
  );
  if (!adminSessionAllowed(registered.project, session.user, passwordRotationRequired)) {
    return null;
  }

  return {
    registered,
    session
  };
};

export const adminSessionAllowed = (
  project: Pick<AuthProject, "features">,
  user: AdminSession["user"],
  passwordRotationRequired: boolean
) => {
  return (
    user.role === AuthUserRole.Admin &&
    !passwordRotationRequired &&
    projectSessionSatisfiesPolicy(project, user)
  );
};

export const getSession = async (auth: RegisteredProject["auth"], headers: Headers) => {
  const session: AdminSession | null = await auth.api.getSession({ headers });

  return session;
};
