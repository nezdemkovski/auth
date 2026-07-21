import { describe, expect, test } from "bun:test";

import { telegramMiniAppConnectionResponse } from "../translator";

describe("Telegram Mini App connection response", () => {
  test("exposes only public connection state", () => {
    expect(
      telegramMiniAppConnectionResponse({
        botUsername: "demo_auth_bot"
      })
    ).toEqual({
      enabled: true,
      botUsername: "demo_auth_bot"
    });
  });
});
