import { describe, expect, test } from "bun:test";
import {
  DEFAULT_REALM_FEATURES,
  RealmTwoFactorRequirement
} from "@nezdemkovski/auth-realm";
import { ErrorCode } from "../../runtime/error-codes";
import { requireProjectSession } from "../project-session";

const createRegistry = (session: {
  user: {
    id: string;
    role: string;
    twoFactorEnabled: boolean;
  };
} | null) => ({
  get: (slug: string) =>
    slug === "demo"
      ? {
          project: {
            features: {
              ...DEFAULT_REALM_FEATURES,
              twoFactor: {
                enabled: true,
                required: RealmTwoFactorRequirement.Everyone
              }
            }
          },
          auth: {
            api: {
              getSession: async () => session
            }
          }
        }
      : null
});

describe("project session boundary", () => {
  test("distinguishes missing realms, missing sessions, and unsatisfied policy", async () => {
    const headers = new Headers();

    const missingProject = await requireProjectSession(
      createRegistry(null),
      "missing",
      headers
    );
    const missingSession = await requireProjectSession(
      createRegistry(null),
      "demo",
      headers
    );
    const missingTwoFactor = await requireProjectSession(
      createRegistry({
        user: {
          id: "user-1",
          role: "user",
          twoFactorEnabled: false
        }
      }),
      "demo",
      headers
    );

    expect(missingProject).toMatchObject({
      ok: false,
      error: ErrorCode.UnknownProject,
      status: 404
    });
    expect(missingSession).toMatchObject({
      ok: false,
      error: ErrorCode.Unauthorized,
      status: 401
    });
    expect(missingTwoFactor).toMatchObject({
      ok: false,
      error: ErrorCode.TwoFactorRequired,
      status: 403
    });
  });

  test("returns the registered realm only after policy is satisfied", async () => {
    const access = await requireProjectSession(
      createRegistry({
        user: {
          id: "user-1",
          role: "user",
          twoFactorEnabled: true
        }
      }),
      "demo",
      new Headers()
    );

    expect(access.ok).toBe(true);
    if (access.ok) {
      expect(access.session.user.id).toBe("user-1");
    }
  });
});
