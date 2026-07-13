import { describe, expect, test } from "bun:test";
import {
  DEFAULT_REALM_FEATURES,
  RealmTwoFactorRequirement
} from "@nezdemkovski/auth-realm";

import {
  AuthUserRole,
  projectSessionSatisfiesPolicy,
  socialSignInAllowed
} from "../index";

describe("realm authentication policy", () => {
  test("blocks unenrolled sessions when two-factor is required", () => {
    const project = {
      features: {
        ...DEFAULT_REALM_FEATURES,
        twoFactor: {
          enabled: true,
          required: RealmTwoFactorRequirement.Everyone
        }
      }
    };

    expect(
      projectSessionSatisfiesPolicy(project, {
        role: AuthUserRole.User,
        twoFactorEnabled: false
      })
    ).toBe(false);
    expect(
      projectSessionSatisfiesPolicy(project, {
        role: AuthUserRole.User,
        twoFactorEnabled: true
      })
    ).toBe(true);
  });

  test("disables social sign-in when the provider cannot enforce required two-factor", () => {
    expect(
      socialSignInAllowed({
        features: {
          ...DEFAULT_REALM_FEATURES,
          twoFactor: {
            enabled: true,
            required: RealmTwoFactorRequirement.Admins
          }
        }
      })
    ).toBe(false);
    expect(socialSignInAllowed({ features: DEFAULT_REALM_FEATURES })).toBe(true);
  });
});
