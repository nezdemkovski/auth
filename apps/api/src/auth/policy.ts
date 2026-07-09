import {
  AuthUserRole,
  ProjectTwoFactorRequirement,
  type AuthProject
} from "../config/projects";

type PolicyUser = {
  id?: string;
  role?: string | null;
  twoFactorEnabled?: boolean;
};

export const mustEnrollTwoFactor = (
  policy: AuthProject["features"]["twoFactor"],
  user: PolicyUser | null
) => {
  if (
    !policy.enabled ||
    policy.required === ProjectTwoFactorRequirement.Optional ||
    user?.twoFactorEnabled
  ) {
    return false;
  }

  return twoFactorRequiredForUser(policy, user);
};

export const twoFactorRequiredForUser = (
  policy: AuthProject["features"]["twoFactor"],
  user: PolicyUser | null
) => {
  if (
    !policy.enabled ||
    policy.required === ProjectTwoFactorRequirement.Optional
  ) {
    return false;
  }

  if (policy.required === ProjectTwoFactorRequirement.Everyone) {
    return true;
  }

  return (
    policy.required === ProjectTwoFactorRequirement.Admins &&
    user?.role === AuthUserRole.Admin
  );
};

export const projectSessionSatisfiesPolicy = (
  project: Pick<AuthProject, "features">,
  user: PolicyUser
) => {
  return !mustEnrollTwoFactor(project.features.twoFactor, user);
};

export const socialSignInAllowed = (project: Pick<AuthProject, "features">) => {
  const policy = project.features.twoFactor;
  return (
    !policy.enabled ||
    policy.required === ProjectTwoFactorRequirement.Optional
  );
};
