import { describe, expect, test } from "bun:test";

import {
  DEFAULT_PROJECT_BILLING,
  DEFAULT_PROJECT_FEATURES,
  DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  DEFAULT_PROJECT_STORAGE,
  type AuthProject
} from "../../../config/projects";
import { pkceChallenge } from "../core";
import {
  createLoginSessionCode,
  exchangeLoginCode,
  getLoginConfig,
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

const verifier = "A".repeat(43);

const unusedOptions: LoginOptions = {
  registry: {
    get() {
      return null;
    },
    isTrustedOrigin() {
      return false;
    }
  },
  secret: "test-secret",
  codeStore: {
    connect: async () => {},
    close: () => {},
    set: async () => {},
    get: async () => null,
    delete: async () => {}
  }
};

const configOptions = {
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
    },
    isTrustedOrigin(slug: string, origin: string | undefined) {
      return slug === project.slug && origin === "https://demo.example.com";
    }
  }
};

describe("login HTTP handlers", () => {
  test("returns login runtime config for trusted redirects and valid PKCE", async () => {
    const url = new URL("http://auth.local/api/demo/login/config/login");
    url.searchParams.set("redirect_uri", "https://demo.example.com/auth/callback");
    url.searchParams.set("state", "client-state");
    url.searchParams.set("code_challenge", pkceChallenge(verifier));
    url.searchParams.set("code_challenge_method", "S256");

    const response = await getLoginConfig(
      new Request(url),
      "demo",
      configOptions
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      page: "login",
      project: "demo",
      projectName: "Demo App",
      redirectUri: "https://demo.example.com/auth/callback",
      state: "client-state",
      codeChallenge: pkceChallenge(verifier)
    });
  });

  test("rejects login runtime config for untrusted redirects", async () => {
    const url = new URL("http://auth.local/api/demo/login/config/login");
    url.searchParams.set("redirect_uri", "https://evil.example/auth/callback");
    url.searchParams.set("code_challenge", pkceChallenge(verifier));
    url.searchParams.set("code_challenge_method", "S256");

    const response = await getLoginConfig(
      new Request(url),
      "demo",
      configOptions
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_redirect_uri"
    });
  });

  test("returns invalid_body for malformed session-code requests", async () => {
    const response = await createLoginSessionCode(
      new Request("http://auth.local/api/demo/login/session-code", {
        method: "POST",
        body: JSON.stringify({})
      }),
      "demo",
      unusedOptions
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_body" });
  });

  test("returns invalid_body for malformed token exchange requests", async () => {
    const response = await exchangeLoginCode(
      new Request("http://auth.local/api/demo/login/token", {
        method: "POST",
        body: JSON.stringify({})
      }),
      "demo",
      unusedOptions
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_body" });
  });
});
