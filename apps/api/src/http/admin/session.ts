import type { AuthRegistry, RegisteredProject } from "../../auth/registry";
import { ADMIN_PROJECT_SLUG, AuthUserRole } from "../../config/projects";

export type AdminSession = {
  user: {
    id: string;
    email: string;
    name: string;
    role?: string | null;
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
  if (!session || session.user.role !== AuthUserRole.Admin) {
    return null;
  }

  return {
    registered,
    session
  };
};

export const getSession = async (auth: RegisteredProject["auth"], headers: Headers) => {
  const session: AdminSession | null = await auth.api.getSession({ headers });

  return session;
};
