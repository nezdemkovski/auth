import { describe, expect, test } from "bun:test";

import { parseTelegramMiniAppConnection } from "../validator";

describe("Telegram Mini App connection input", () => {
  test("normalizes the bot username and keeps the BotFather token server-side", () => {
    expect(
      parseTelegramMiniAppConnection({
        botUsername: " @demo_auth_bot ",
        botToken: " 123456789:abcdefghijklmnopqrstuvwxyz "
      })
    ).toEqual({
      botUsername: "demo_auth_bot",
      botToken: "123456789:abcdefghijklmnopqrstuvwxyz"
    });
  });

  test("rejects incomplete or expanded configuration", () => {
    expect(
      parseTelegramMiniAppConnection({
        botUsername: "bot",
        botToken: "secret"
      })
    ).toBeNull();
    expect(
      parseTelegramMiniAppConnection({
        botUsername: "demo_auth_bot",
        botToken: "123456789:abcdefghijklmnopqrstuvwxyz",
        validateInitData: false
      })
    ).toBeNull();
  });
});
