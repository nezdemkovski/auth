import { describe, expect, test } from "bun:test";

import {
  authSessionFromUserInfo,
  browserRedirectUri,
  safeReturnTo
} from "../client/shared";

describe("auth client boundary", () => {
  test("does not allow an external post-login redirect", () => {
    expect(() =>
      safeReturnTo(
        "https://attacker.example/steal",
        new URL("https://app.example/settings")
      )
    ).toThrow("current application");
  });

  test("maps the standard OIDC user info response", () => {
    expect(
      authSessionFromUserInfo({
        sub: "user-1",
        name: "Demo User",
        email: "user@example.com",
        email_verified: true,
        picture: "https://cdn.example/avatar.png"
      })
    ).toEqual({
      user: {
        id: "user-1",
        name: "Demo User",
        email: "user@example.com",
        emailVerified: true,
        image: "https://cdn.example/avatar.png"
      }
    });
  });

  test("uses the realm application's canonical browser callback", () => {
    expect(
      browserRedirectUri(undefined, new URL("https://app.example/library"))
    ).toBe("https://app.example/auth/callback");
  });

  test("keeps an explicitly configured browser callback", () => {
    expect(
      browserRedirectUri(
        "https://app.example/custom/callback",
        new URL("https://app.example/library")
      )
    ).toBe("https://app.example/custom/callback");
  });
});
