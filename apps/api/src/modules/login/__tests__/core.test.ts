import { describe, expect, test } from "bun:test";

import {
  internalAuthHeaders,
  pkceChallenge,
  redirectUriAllowed,
  validPkceChallenge,
  verifyPkce
} from "../core";
import { createLoginCodeStore } from "../store";

const verifier = "A".repeat(43);

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
        return project === "openmarkers" && origin === "https://openmarkers.app";
      }
    };

    expect(
      redirectUriAllowed(
        registry as never,
        "openmarkers",
        "https://openmarkers.app/auth/callback"
      )
    ).toBe(true);
    expect(
      redirectUriAllowed(
        registry as never,
        "openmarkers",
        "https://evil.example/auth/callback"
      )
    ).toBe(false);
    expect(
      redirectUriAllowed(
        registry as never,
        "openmarkers",
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
      project: "openmarkers",
      sessionCookie: "auth.session=value",
      email: "user@example.com",
      redirectUri: "https://openmarkers.app/auth/callback",
      codeChallenge: pkceChallenge(verifier),
      expiresAt: Date.now() + 60_000
    });

    expect(await store.get("valid-code")).not.toBeNull();
    expect(await store.get("valid-code")).not.toBeNull();

    await store.delete("valid-code");
    expect(await store.get("valid-code")).toBeNull();

    await store.set("expired-code", {
      project: "openmarkers",
      sessionCookie: "auth.session=value",
      email: "user@example.com",
      redirectUri: "https://openmarkers.app/auth/callback",
      codeChallenge: pkceChallenge(verifier),
      expiresAt: Date.now() - 1
    });

    expect(await store.get("expired-code")).toBeNull();
  });
});
