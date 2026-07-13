import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

import {
  DEFAULT_PROJECT_BILLING,
  DEFAULT_PROJECT_FEATURES,
  DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  DEFAULT_PROJECT_STORAGE,
  type AuthProject
} from "../../../config/projects";
import { ErrorCode } from "../../../runtime/error-codes";
import {
  getLoginConfig,
  registerLoginRoutes,
  type LoginOptions
} from "../http";

const project: AuthProject = {
  slug: "demo",
  name: "Demo App",
  schema: "demo_auth",
  description: "",
  iconUrl: "",
  appUrl: "https://demo.example.com",
  trustedOrigins: ["https://demo.example.com"],
  features: DEFAULT_PROJECT_FEATURES,
  socialProviders: DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  billing: DEFAULT_PROJECT_BILLING,
  storage: DEFAULT_PROJECT_STORAGE
};

const observabilityReporter = {
  publicConfig() {
    return {
      enabled: false,
      dsn: "",
      environment: "test"
    };
  }
};

const options: LoginOptions = {
  registry: {
    get(slug: string) {
      return slug === project.slug
        ? {
            project,
            auth: {
              handler: async () => Response.json({ ok: true })
            }
          }
        : null;
    }
  },
  observabilityReporter
};

describe("login HTTP handlers", () => {
  test("returns hosted UI config only for Better Auth signed OAuth queries", async () => {
    const url = new URL("http://auth.local/api/demo/login/config/login");
    url.searchParams.set("redirect_uri", "https://product.example/auth/callback");
    url.searchParams.set("state", "client-state");
    url.searchParams.set("mode", "signup");
    url.searchParams.set("ba_param", "client_id");
    url.searchParams.set("sig", "signed-query");

    const response = await getLoginConfig(new Request(url), "demo", options);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      page: "login",
      project: "demo",
      projectName: "Demo App",
      mode: "signup"
    });
  });

  test("rejects direct login pages without a Better Auth signed query", async () => {
    const response = await getLoginConfig(
      new Request("http://auth.local/api/demo/login/config/login"),
      "demo",
      options
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: ErrorCode.InvalidBody });
  });

  test("does not register the removed custom handoff endpoints", async () => {
    const app = new Hono();
    registerLoginRoutes(app, options);

    const sessionCode = await app.request("/api/demo/login/session-code", {
      method: "POST"
    });
    const token = await app.request("/api/demo/login/token", {
      method: "POST"
    });

    expect(sessionCode.status).toBe(404);
    expect(token.status).toBe(404);
  });
});
