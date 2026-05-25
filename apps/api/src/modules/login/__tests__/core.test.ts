import { describe, expect, test } from "bun:test";

import {
  DEFAULT_PROJECT_BILLING,
  DEFAULT_PROJECT_FEATURES,
  DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  DEFAULT_PROJECT_STORAGE,
  type AuthProject
} from "../../../config/projects";
import {
  internalAuthHeaders,
  LoginFlowError,
  LoginFlowService,
  type LoginRegisteredProject,
  pkceChallenge,
  redirectUriAllowed,
  validPkceChallenge,
  verifyPkce
} from "../core";
import {
  createLoginCodeStore,
  type LoginCodeStore,
  type PendingLoginCode
} from "../store";

const verifier = "A".repeat(43);
const redirectUri = "https://demo.example.com/auth/callback";
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

const createRegistry = (registered: LoginRegisteredProject | null) => {
  return {
    get(slug: string) {
      return slug === "demo" ? registered : null;
    },
    isTrustedOrigin(project: string, origin: string | undefined) {
      return project === "demo" && origin === "https://demo.example.com";
    }
  };
};

const createRegisteredProject = (sessionResponse: Response): LoginRegisteredProject => {
  return {
    project,
    auth: {
      handler: async () => sessionResponse
    }
  };
};

const createMemoryStore = () => {
  const codes = new Map<string, PendingLoginCode>();
  const deletedCodes: string[] = [];

  const store: LoginCodeStore = {
    connect: async () => {},
    close: () => {},
    set: async (code, payload) => {
      codes.set(code, payload);
    },
    get: async (code) => {
      return codes.get(code) ?? null;
    },
    delete: async (code) => {
      deletedCodes.push(code);
      codes.delete(code);
    }
  };

  return {
    codes,
    deletedCodes,
    store
  };
};

describe("login auth security helpers", () => {
  test("requires S256-shaped PKCE values and verifies the matching verifier", () => {
    const challenge = pkceChallenge(verifier);

    expect(validPkceChallenge(challenge)).toBe(true);
    expect(verifyPkce(challenge, verifier)).toBe(true);
    expect(verifyPkce(challenge, "B".repeat(43))).toBe(false);
    expect(validPkceChallenge("too-short")).toBe(false);
  });

  test("allows redirects by exact trusted origin only", () => {
    const registry = {
      isTrustedOrigin(project: string, origin: string | undefined) {
        return project === "demo" && origin === "https://demo.example.com";
      }
    };

    expect(
      redirectUriAllowed(
        registry,
        "demo",
        "https://demo.example.com/auth/callback"
      )
    ).toBe(true);
    expect(
      redirectUriAllowed(
        registry,
        "demo",
        "https://evil.example/auth/callback"
      )
    ).toBe(false);
    expect(
      redirectUriAllowed(
        registry,
        "demo",
        "not a url"
      )
    ).toBe(false);
  });

  test("passes proxy headers to Better Auth only when trusted proxy mode is enabled", () => {
    const source = new Headers({
      "cf-connecting-ip": "203.0.113.10",
      "x-forwarded-for": "203.0.113.10, 10.0.0.1",
      "x-real-ip": "203.0.113.11",
      "x-client-ip": "203.0.113.12",
      "user-agent": "test-agent"
    });

    const direct = internalAuthHeaders(
      source,
      {},
      { trustProxyHeaders: false }
    );
    expect(direct.get("user-agent")).toBe("test-agent");
    expect(direct.get("cf-connecting-ip")).toBeNull();
    expect(direct.get("x-forwarded-for")).toBeNull();

    const proxied = internalAuthHeaders(
      source,
      {},
      { trustProxyHeaders: true }
    );
    expect(proxied.get("cf-connecting-ip")).toBe("203.0.113.10");
    expect(proxied.get("x-forwarded-for")).toBe("203.0.113.10, 10.0.0.1");
  });

  test("memory login-code store expires codes and deletes only when asked", async () => {
    const store = createLoginCodeStore(null);
    await store.set("valid-code", {
      project: "demo",
      sessionCookie: "auth.session=value",
      email: "user@example.com",
      redirectUri: "https://demo.example.com/auth/callback",
      codeChallenge: pkceChallenge(verifier),
      expiresAt: Date.now() + 60_000
    });

    expect(await store.get("valid-code")).not.toBeNull();
    expect(await store.get("valid-code")).not.toBeNull();

    await store.delete("valid-code");
    expect(await store.get("valid-code")).toBeNull();

    await store.set("expired-code", {
      project: "demo",
      sessionCookie: "auth.session=value",
      email: "user@example.com",
      redirectUri: "https://demo.example.com/auth/callback",
      codeChallenge: pkceChallenge(verifier),
      expiresAt: Date.now() - 1
    });

    expect(await store.get("expired-code")).toBeNull();
  });

  test("issues a login code only from an authenticated session", async () => {
    const { codes, store } = createMemoryStore();
    const service = new LoginFlowService({
      registry: createRegistry(
        createRegisteredProject(
          Response.json({
            user: {
              email: "user@example.com"
            }
          })
        )
      ),
      codeStore: store
    });

    const result = await service.createSessionCode({
      project: "demo",
      redirectUri,
      state: "client-state",
      codeChallenge: pkceChallenge(verifier),
      headers: new Headers({
        cookie: "auth.session=value"
      })
    });
    const callback = new URL(result.redirectTo);
    const code = callback.searchParams.get("code") ?? "";

    expect(result.email).toBe("user@example.com");
    expect(callback.origin).toBe("https://demo.example.com");
    expect(callback.searchParams.get("state")).toBe("client-state");
    expect(codes.get(code)).toMatchObject({
      project: "demo",
      sessionCookie: "auth.session=value",
      email: "user@example.com",
      redirectUri,
      codeChallenge: pkceChallenge(verifier)
    });
  });

  test("does not consume a login code until project, redirect, and PKCE all match", async () => {
    const { deletedCodes, store } = createMemoryStore();
    await store.set("login-code", {
      project: "demo",
      sessionCookie: "auth.session=value",
      email: "user@example.com",
      redirectUri,
      codeChallenge: pkceChallenge(verifier),
      expiresAt: Date.now() + 60_000
    });
    const service = new LoginFlowService({
      registry: createRegistry(createRegisteredProject(Response.json({}))),
      codeStore: store
    });

    await expect(
      service.exchangeCode({
        project: "demo",
        code: "login-code",
        redirectUri,
        codeVerifier: "B".repeat(43)
      })
    ).rejects.toBeInstanceOf(LoginFlowError);
    expect(deletedCodes).toEqual([]);

    await expect(
      service.exchangeCode({
        project: "demo",
        code: "login-code",
        redirectUri,
        codeVerifier: verifier
      })
    ).resolves.toEqual({
      sessionCookie: "auth.session=value",
      email: "user@example.com"
    });
    expect(deletedCodes).toEqual(["login-code"]);
  });
});
