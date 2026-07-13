import { describe, expect, test } from "bun:test";

import {
  AuthUserRole,
  DEFAULT_PROJECT_BILLING,
  DEFAULT_PROJECT_FEATURES,
  DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  DEFAULT_PROJECT_STORAGE,
  ProjectTwoFactorRequirement,
  type AuthProject
} from "../../../config/projects";
import {
  internalAuthHeaders,
  type LoginRegisteredProject,
  resolveLoginNextAction
} from "../core";

const project: AuthProject = {
  slug: "demo",
  name: "Demo App",
  schema: "demo_auth",
  description: "",
  iconUrl: "",
  appUrl: "https://demo.example.com",
  trustedOrigins: ["https://demo.example.com"],
  features: {
    ...DEFAULT_PROJECT_FEATURES,
    passkey: { enabled: true },
    twoFactor: {
      enabled: true,
      required: ProjectTwoFactorRequirement.Admins
    }
  },
  socialProviders: DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  billing: DEFAULT_PROJECT_BILLING,
  storage: DEFAULT_PROJECT_STORAGE
};

describe("hosted login policy", () => {
  test("passes proxy headers to Better Auth only in trusted proxy mode", () => {
    const source = new Headers({
      "cf-connecting-ip": "203.0.113.10",
      "x-forwarded-for": "203.0.113.10, 10.0.0.1",
      "user-agent": "test-agent"
    });

    const direct = internalAuthHeaders(source, {}, {
      trustProxyHeaders: false
    });
    expect(direct.get("user-agent")).toBe("test-agent");
    expect(direct.get("cf-connecting-ip")).toBeNull();

    const proxied = internalAuthHeaders(source, {}, {
      trustProxyHeaders: true
    });
    expect(proxied.get("cf-connecting-ip")).toBe("203.0.113.10");
    expect(proxied.get("x-forwarded-for")).toBe(
      "203.0.113.10, 10.0.0.1"
    );
  });

  test("reads session policy and passkey state through Better Auth", async () => {
    const requestedPaths: string[] = [];
    const registered: LoginRegisteredProject = {
      project,
      auth: {
        handler: async (request) => {
          requestedPaths.push(new URL(request.url).pathname);
          if (request.url.endsWith("/get-session")) {
            return Response.json({
              user: {
                role: AuthUserRole.Admin,
                twoFactorEnabled: false
              }
            });
          }

          return Response.json([]);
        }
      }
    };

    await expect(
      resolveLoginNextAction(
        {
          registry: {
            get: (slug) => (slug === project.slug ? registered : null)
          }
        },
        {
          project: project.slug,
          headers: new Headers({
            cookie: "auth_demo.session_token=value"
          })
        }
      )
    ).resolves.toMatchObject({
      user: {
        role: AuthUserRole.Admin,
        twoFactorEnabled: false
      },
      hasPasskeys: false
    });
    expect(requestedPaths).toEqual([
      "/api/demo/auth/get-session",
      "/api/demo/auth/passkey/list-user-passkeys"
    ]);
  });
});
