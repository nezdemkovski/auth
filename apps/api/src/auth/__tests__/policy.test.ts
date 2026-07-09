import { describe, expect, test } from "bun:test";

import {
  AuthUserRole,
  DEFAULT_PROJECT_FEATURES,
  ProjectTwoFactorRequirement
} from "../../config/projects";
import {
  projectSessionSatisfiesPolicy,
  socialSignInAllowed
} from "../policy";

describe("realm authentication policy", () => {
  test("blocks unenrolled sessions when two-factor is required", () => {
    const project = {
      features: {
        ...DEFAULT_PROJECT_FEATURES,
        twoFactor: {
          enabled: true,
          required: ProjectTwoFactorRequirement.Everyone
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
          ...DEFAULT_PROJECT_FEATURES,
          twoFactor: {
            enabled: true,
            required: ProjectTwoFactorRequirement.Admins
          }
        }
      })
    ).toBe(false);
    expect(socialSignInAllowed({ features: DEFAULT_PROJECT_FEATURES })).toBe(true);
  });
});
