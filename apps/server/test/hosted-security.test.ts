import { describe, expect, test } from "bun:test";

import { __hostedTestUtils } from "../src/http/hosted";

const verifier = "A".repeat(43);

describe("hosted auth security helpers", () => {
  test("escapes injected HTML and serializes config safely inside script tags", () => {
    expect(__hostedTestUtils.escapeHtml(`<img src=x onerror="alert(1)">`)).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
    );
    expect(
      __hostedTestUtils.serializeHostedConfig({
        value: "</script><script>alert(1)</script>"
      })
    ).not.toContain("</script>");
  });

  test("requires S256-shaped PKCE values and verifies the matching verifier", () => {
    const challenge = __hostedTestUtils.pkceChallenge(verifier);

    expect(__hostedTestUtils.validPkceChallenge(challenge)).toBe(true);
    expect(__hostedTestUtils.verifyPkce(challenge, verifier)).toBe(true);
    expect(__hostedTestUtils.verifyPkce(challenge, "B".repeat(43))).toBe(false);
    expect(__hostedTestUtils.validPkceChallenge("too-short")).toBe(false);
  });

  test("allows redirects by exact trusted origin only", () => {
    const registry = {
      isTrustedOrigin(project: string, origin: string | undefined) {
        return project === "openmarkers" && origin === "https://openmarkers.app";
      }
    };

    expect(
      __hostedTestUtils.redirectUriAllowed(
        registry as never,
        "openmarkers",
        "https://openmarkers.app/auth/callback"
      )
    ).toBe(true);
    expect(
      __hostedTestUtils.redirectUriAllowed(
        registry as never,
        "openmarkers",
        "https://evil.example/auth/callback"
      )
    ).toBe(false);
    expect(
      __hostedTestUtils.redirectUriAllowed(
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

    const direct = __hostedTestUtils.internalAuthHeaders(
      source,
      {},
      { trustProxyHeaders: false }
    );
    expect(direct.get("user-agent")).toBe("test-agent");
    expect(direct.get("cf-connecting-ip")).toBeNull();
    expect(direct.get("x-forwarded-for")).toBeNull();

    const proxied = __hostedTestUtils.internalAuthHeaders(
      source,
      {},
      { trustProxyHeaders: true }
    );
    expect(proxied.get("cf-connecting-ip")).toBe("203.0.113.10");
    expect(proxied.get("x-forwarded-for")).toBe("203.0.113.10, 10.0.0.1");
  });

  test("uses only the origin as Better Auth callbackURL", () => {
    expect(
      __hostedTestUtils.callbackUrlFromRedirectUri(
        "https://openmarkers.app/auth/callback?state=secret"
      )
    ).toBe("https://openmarkers.app");
  });

  test("memory hosted-code store expires codes and deletes only when asked", async () => {
    const store = __hostedTestUtils.createHostedCodeStore(null);
    await store.set("valid-code", {
      project: "openmarkers",
      sessionCookie: "auth.session=value",
      email: "user@example.com",
      redirectUri: "https://openmarkers.app/auth/callback",
      codeChallenge: __hostedTestUtils.pkceChallenge(verifier),
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
      codeChallenge: __hostedTestUtils.pkceChallenge(verifier),
      expiresAt: Date.now() - 1
    });

    expect(await store.get("expired-code")).toBeNull();
  });
});
