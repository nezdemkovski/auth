import { projectSessionSatisfiesPolicy } from "@nezdemkovski/auth-better-auth-runtime";
import type { AuthProject } from "../config/projects";
import { ErrorCode } from "../runtime/error-codes";

type ProjectSession = {
  user: {
    id: string;
    role?: string | null;
    twoFactorEnabled?: boolean;
  };
};

type ProjectSessionRegistered = {
  project: Pick<AuthProject, "features">;
  auth: {
    api: {
      getSession(input: { headers: Headers }): Promise<ProjectSession | null>;
    };
  };
};

type ProjectSessionRegistry<TRegistered extends ProjectSessionRegistered> = {
  get(slug: string): TRegistered | null;
};

export type ProjectSessionAccess<TRegistered extends ProjectSessionRegistered> =
  | {
      ok: true;
      registered: TRegistered;
      session: ProjectSession;
    }
  | {
      ok: false;
      error: ErrorCode.UnknownProject;
      status: 404;
    }
  | {
      ok: false;
      error: ErrorCode.Unauthorized;
      status: 401;
    }
  | {
      ok: false;
      error: ErrorCode.TwoFactorRequired;
      status: 403;
    };

export const requireProjectSession = async <
  TRegistered extends ProjectSessionRegistered
>(
  registry: ProjectSessionRegistry<TRegistered>,
  projectSlug: string,
  headers: Headers
): Promise<ProjectSessionAccess<TRegistered>> => {
  const registered = registry.get(projectSlug);
  if (!registered) {
    return {
      ok: false,
      error: ErrorCode.UnknownProject,
      status: 404
    };
  }

  const session = await registered.auth.api.getSession({ headers });
  if (!session) {
    return {
      ok: false,
      error: ErrorCode.Unauthorized,
      status: 401
    };
  }

  if (!projectSessionSatisfiesPolicy(registered.project, session.user)) {
    return {
      ok: false,
      error: ErrorCode.TwoFactorRequired,
      status: 403
    };
  }

  return {
    ok: true,
    registered,
    session
  };
};
