import { describe, expect, test } from "bun:test";
import {
  parseBillingUsageSummaryResponse,
  parseUserAvatarResponse
} from "../index";

describe("public auth contracts", () => {
  test("parses billing and avatar response envelopes", () => {
    expect(parseBillingUsageSummaryResponse({ summary: { key: "messages", used: 2, limit: 10, remaining: 8, unlimited: false } })).toEqual({
      key: "messages",
      used: 2,
      limit: 10,
      remaining: 8,
      unlimited: false
    });
    expect(parseUserAvatarResponse({ user: { image: "https://demo.example.com/avatar.png" } })).toEqual({
      image: "https://demo.example.com/avatar.png"
    });
  });
});
