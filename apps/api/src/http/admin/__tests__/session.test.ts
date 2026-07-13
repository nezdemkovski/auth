import { describe, expect, test } from "bun:test";
import { AuthUserRole } from "@nezdemkovski/auth-better-auth-runtime";
import { RealmTwoFactorRequirement } from "@nezdemkovski/auth-realm";

import { ADMIN_PROJECT } from "../../../config/projects";
import { adminSessionAllowed } from "../session";

describe("admin session authorization", () => {
  test("denies privileged mutations until the bootstrap password is changed", () => {
    const admin = {
      id: "admin-1",
      email: "admin@example.com",
      name: "Admin",
      role: AuthUserRole.Admin,
      twoFactorEnabled: true
    };

    expect(adminSessionAllowed(ADMIN_PROJECT, admin, true)).toBe(false);
    expect(adminSessionAllowed(ADMIN_PROJECT, admin, false)).toBe(true);
    expect(
      adminSessionAllowed(
        ADMIN_PROJECT,
        { ...admin, role: AuthUserRole.User },
        false
      )
    ).toBe(false);
  });

  test("applies the realm two-factor policy to privileged API access", () => {
    const project = {
      ...ADMIN_PROJECT,
      features: {
        ...ADMIN_PROJECT.features,
        twoFactor: {
          enabled: true,
          required: RealmTwoFactorRequirement.Everyone
        }
      }
    };
    const admin = {
      id: "admin-1",
      email: "admin@example.com",
      name: "Admin",
      role: AuthUserRole.Admin,
      twoFactorEnabled: false
    };

    expect(adminSessionAllowed(project, admin, false)).toBe(false);
    expect(
      adminSessionAllowed(
        project,
        { ...admin, twoFactorEnabled: true },
        false
      )
    ).toBe(true);
  });
});
