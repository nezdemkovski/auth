import {
  RealmTwoFactorRequirement,
  type Realm
} from "@nezdemkovski/auth-realm";

import { AuthUserRole } from "./model";

type PolicyUser = {
  id?: string;
  role?: string | null;
  twoFactorEnabled?: boolean;
};

export const mustEnrollTwoFactor = (
  policy: Realm["features"]["twoFactor"],
  user: PolicyUser | null
) => {
  if (
    !policy.enabled ||
    policy.required === RealmTwoFactorRequirement.Optional ||
    user?.twoFactorEnabled
  ) {
    return false;
  }

  return twoFactorRequiredForUser(policy, user);
};

export const twoFactorRequiredForUser = (
  policy: Realm["features"]["twoFactor"],
  user: PolicyUser | null
) => {
  if (
    !policy.enabled ||
    policy.required === RealmTwoFactorRequirement.Optional
  ) {
    return false;
  }

  if (policy.required === RealmTwoFactorRequirement.Everyone) {
    return true;
  }

  return (
    policy.required === RealmTwoFactorRequirement.Admins &&
    user?.role === AuthUserRole.Admin
  );
};

export const projectSessionSatisfiesPolicy = (
  project: Pick<Realm, "features">,
  user: PolicyUser
) => {
  return !mustEnrollTwoFactor(project.features.twoFactor, user);
};

export const socialSignInAllowed = (project: Pick<Realm, "features">) => {
  const policy = project.features.twoFactor;
  return (
    !policy.enabled ||
    policy.required === RealmTwoFactorRequirement.Optional
  );
};
