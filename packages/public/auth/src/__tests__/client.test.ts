import { describe, expect, test } from "bun:test";

import {
  authSessionFromUserInfo,
  browserRedirectUri,
  safeReturnTo
} from "../client/shared";
import { createTelegramMiniAppSignInRequest } from "../client/web";

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

  test("builds a top-level Telegram Mini App handoff to the realm plugin", () => {
    expect(createTelegramMiniAppSignInRequest(
      "https://auth.example.com/api/demo/",
      " signed-init-data ",
      new URL("https://auth.example.com/api/demo/oauth2/authorize?state=demo")
    )).toEqual({
      action: "https://auth.example.com/api/demo/auth/telegram/miniapp/signin",
      fields: {
        initData: "signed-init-data",
        callbackURL:
          "https://auth.example.com/api/demo/oauth2/authorize?state=demo"
      }
    });
  });

  test("does not build a Telegram Mini App handoff without a credential", () => {
    expect(() =>
      createTelegramMiniAppSignInRequest(
        "https://auth.example.com/api/demo",
        " ",
        new URL("https://auth.example.com/api/demo/oauth2/authorize")
      )
    ).toThrow("initData is required");
  });
});
