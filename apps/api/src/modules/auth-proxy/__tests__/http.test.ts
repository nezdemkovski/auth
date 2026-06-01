import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

import {
  ADMIN_PROJECT,
  BillingEnvironment,
  BillingProvider,
  DEFAULT_PROJECT_BILLING,
  DEFAULT_PROJECT_FEATURES,
  DEFAULT_PROJECT_STORAGE,
  DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  ProjectAgentAuthMode,
  ProjectTwoFactorRequirement,
  type AuthProject
} from "../../../config/projects";
import { ErrorCode } from "../../../runtime/error-codes";
import {
  registerAuthProxyRoutes,
  type AuthProxyRegisteredProject,
  type AuthProxyRegistry,
  isEnabledAuthFeaturePath
} from "../http";

const project: AuthProject = {
  slug: "demo",
  name: "Demo App",
  schema: "demo_auth",
  description: "",
  iconUrl: "",
  appUrl: "",
  trustedOrigins: ["https://demo.example.com"],
  features: DEFAULT_PROJECT_FEATURES,
  socialProviders: DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  billing: DEFAULT_PROJECT_BILLING,
  storage: DEFAULT_PROJECT_STORAGE
};

const createRegisteredProject = (
  authProject: AuthProject,
  handledPaths: string[] = []
): AuthProxyRegisteredProject => ({
  project: authProject,
  auth: {
    handler: async (request) => {
      handledPaths.push(new URL(request.url).pathname);
      return Response.json({ ok: true });
    },
    api: {
      getAgentConfiguration: async () => ({ ok: true }),
      getOAuthServerConfig: () => ({ ok: true }),
      getOpenIdConfig: () => ({ ok: true })
    }
  }
});

const createRegistry = (
  registered: AuthProxyRegisteredProject | null,
  trustedOrigin = "https://demo.example.com"
): AuthProxyRegistry => ({
  get: (slug) => (slug === registered?.project.slug ? registered : null),
  isTrustedOrigin: (_slug, origin) => origin === trustedOrigin
});

const createAuthProxyApp = (registry: AuthProxyRegistry) => {
  const app = new Hono();
  registerAuthProxyRoutes(app, { registry });
  return app;
};

describe("auth route feature gates", () => {
  test("blocks public sign-up in the built-in admin realm", () => {
    expect(
      isEnabledAuthFeaturePath(
        ADMIN_PROJECT,
        "/api/admin/auth/sign-up/email"
      )
    ).toBe(false);
  });

  test("keeps sign-up available for regular realms", () => {
    expect(
      isEnabledAuthFeaturePath(
        project,
        "/api/demo/auth/sign-up/email"
      )
    ).toBe(true);
  });

  test("keeps disabled feature endpoints closed", () => {
    expect(
      isEnabledAuthFeaturePath(
        project,
        "/api/demo/auth/passkey/verify-authentication"
      )
    ).toBe(false);
    expect(
      isEnabledAuthFeaturePath(
        project,
        "/api/demo/auth/oauth2/authorize"
      )
    ).toBe(false);
    expect(
      isEnabledAuthFeaturePath(
        project,
        "/api/demo/auth/checkout"
      )
    ).toBe(false);
  });

  test("allows feature endpoints only when the realm explicitly enables them", () => {
    const enabledProject: AuthProject = {
      ...project,
      features: {
        passkey: { enabled: true },
        twoFactor: {
          enabled: true,
          required: ProjectTwoFactorRequirement.Optional
        },
        agentAuth: {
          enabled: true,
          mode: ProjectAgentAuthMode.ReadOnly
        },
        oauthProvider: {
          enabled: true,
          dynamicClientRegistration: false
        }
      },
      billing: {
        provider: BillingProvider.Polar,
        enabled: true,
        environment: BillingEnvironment.Sandbox,
        organizationId: "",
        accessToken: "polar-token",
        webhookSecret: "",
        products: [],
        freeEntitlements: []
      }
    };

    expect(
      isEnabledAuthFeaturePath(
        enabledProject,
        "/api/demo/auth/passkey/verify-authentication"
      )
    ).toBe(true);
    expect(
      isEnabledAuthFeaturePath(
        enabledProject,
        "/api/demo/auth/two-factor/verify-totp"
      )
    ).toBe(true);
    expect(
      isEnabledAuthFeaturePath(
        enabledProject,
        "/api/demo/auth/oauth2/authorize"
      )
    ).toBe(true);
    expect(
      isEnabledAuthFeaturePath(
        enabledProject,
        "/api/demo/auth/checkout"
      )
    ).toBe(true);
  });
});

describe("auth proxy HTTP boundary", () => {
  test("returns not found for disabled feature routes without calling Better Auth", async () => {
    const handledPaths: string[] = [];
    const app = createAuthProxyApp(
      createRegistry(createRegisteredProject(project, handledPaths))
    );

    const response = await app.request("/api/demo/auth/passkey/verify-authentication");

    expect(response.status).toBe(404);
    expect(handledPaths).toEqual([]);
  });

  test("forwards enabled auth routes to the realm auth handler", async () => {
    const handledPaths: string[] = [];
    const app = createAuthProxyApp(
      createRegistry(createRegisteredProject(project, handledPaths))
    );

    const response = await app.request("/api/demo/auth/sign-in/email", {
      method: "POST"
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(handledPaths).toEqual(["/api/demo/auth/sign-in/email"]);
  });

  test("rejects unknown realm auth routes before calling any handler", async () => {
    const app = createAuthProxyApp(createRegistry(null));

    const response = await app.request("/api/missing/auth/sign-in/email", {
      method: "POST"
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: ErrorCode.UnknownProject });
  });
});
