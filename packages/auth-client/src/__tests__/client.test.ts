import { describe, expect, test } from "bun:test";
import {
  AuthSessionStatus,
  createAuthClient,
  createMemoryAuthStorage,
  type AuthCrypto,
  type AuthFetcher
} from "../index";

const testCrypto: AuthCrypto = {
  randomBytes: (length) => new Uint8Array(length).fill(7),
  sha256: async () => new Uint8Array(32).fill(9)
};

const accessToken = (expiresAt: number) => {
  const header = btoa(JSON.stringify({ alg: "none" })).replaceAll("=", "");
  const payload = btoa(JSON.stringify({ exp: expiresAt })).replaceAll("=", "");
  return `${header}.${payload}.signature`;
};

const jsonResponse = (body: unknown, status = 200, headers?: HeadersInit) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
};

describe("auth client", () => {
  test("completes PKCE login and deduplicates access token refresh", async () => {
    let tokenRequests = 0;
    const fetcher: AuthFetcher = async (input) => {
      const url = new URL(input.toString());
      if (url.pathname.endsWith("/login/token")) {
        return jsonResponse({ sessionCookie: "auth_demo.session_token=session-value", email: "user@example.com" });
      }
      if (url.pathname.endsWith("/auth/token")) {
        tokenRequests += 1;
        return jsonResponse({ token: accessToken(2_000_000_000) });
      }
      return jsonResponse({ error: "not_found" }, 404);
    };
    const auth = createAuthClient({
      baseUrl: "https://auth.example.com",
      realm: "demo",
      storage: createMemoryAuthStorage(),
      crypto: testCrypto,
      fetch: fetcher,
      now: () => 1_000_000
    });

    const loginUrl = new URL(await auth.login.createUrl({ redirectUri: "https://demo.example.com/auth/callback" }));
    const state = loginUrl.searchParams.get("state");
    expect(state).not.toBeNull();
    await expect(
      auth.login.complete({
        callbackUrl: `https://demo.example.com/auth/callback?code=code-1&state=${state}`,
        redirectUri: "https://demo.example.com/auth/callback"
      })
    ).resolves.toBe(true);

    const [first, second] = await Promise.all([
      auth.session.getAccessToken(),
      auth.session.getAccessToken()
    ]);
    expect(first).toBe(second);
    expect(tokenRequests).toBe(1);
    expect(auth.session.getState()).toEqual({ status: AuthSessionStatus.Authenticated });
  });

  test("rejects a callback with the wrong state", async () => {
    const auth = createAuthClient({
      baseUrl: "https://auth.example.com",
      realm: "demo",
      storage: createMemoryAuthStorage(),
      crypto: testCrypto,
      fetch: async () => jsonResponse({ error: "unexpected" }, 500)
    });
    await auth.login.createUrl({ redirectUri: "https://demo.example.com/auth/callback" });
    await expect(
      auth.login.complete({
        callbackUrl: "https://demo.example.com/auth/callback?code=code-1&state=wrong",
        redirectUri: "https://demo.example.com/auth/callback"
      })
    ).rejects.toMatchObject({ code: "invalid_callback" });
  });

  test("authenticated fetch refreshes once after a 401", async () => {
    let resourceRequests = 0;
    let tokenRequests = 0;
    const fetcher: AuthFetcher = async (input) => {
      const url = new URL(input.toString());
      if (url.hostname === "auth.example.com" && url.pathname.endsWith("/login/token")) {
        return jsonResponse({ sessionCookie: "auth_demo.session_token=session-value" });
      }
      if (url.hostname === "auth.example.com" && url.pathname.endsWith("/auth/token")) {
        tokenRequests += 1;
        return jsonResponse({ token: accessToken(2_000_000_000 + tokenRequests) });
      }
      resourceRequests += 1;
      return resourceRequests === 1 ? jsonResponse({ error: "expired" }, 401) : jsonResponse({ ok: true });
    };
    const auth = createAuthClient({
      baseUrl: "https://auth.example.com",
      realm: "demo",
      storage: createMemoryAuthStorage(),
      crypto: testCrypto,
      fetch: fetcher,
      now: () => 1_000_000
    });
    const loginUrl = new URL(await auth.login.createUrl({ redirectUri: "https://demo.example.com/callback" }));
    await auth.login.complete({
      callbackUrl: `https://demo.example.com/callback?code=code-1&state=${loginUrl.searchParams.get("state")}`,
      redirectUri: "https://demo.example.com/callback"
    });

    const response = await auth.fetch("https://api.demo.example.com/profile");
    expect(response.status).toBe(200);
    expect(resourceRequests).toBe(2);
    expect(tokenRequests).toBe(2);
  });

  test("keeps a stored session and allows initialize retry after a transient failure", async () => {
    const storage = createMemoryAuthStorage();
    await storage.set("@nezdemkovski/auth:demo:session", "session-value");
    let tokenRequests = 0;
    const auth = createAuthClient({
      baseUrl: "https://auth.example.com",
      realm: "demo",
      storage,
      crypto: testCrypto,
      fetch: async () => {
        tokenRequests += 1;
        return tokenRequests === 1
          ? jsonResponse({ error: "unavailable" }, 503)
          : jsonResponse({ token: accessToken(2_000_000_000) });
      },
      now: () => 1_000_000
    });

    await expect(auth.session.initialize()).rejects.toMatchObject({ status: 503 });
    await expect(auth.session.initialize()).resolves.toBeUndefined();
    expect(auth.session.getState()).toEqual({ status: AuthSessionStatus.Authenticated });
  });
});
