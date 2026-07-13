import { describe, expect, test } from "bun:test";
import {
  parseBillingUsageSummaryResponse,
  parseLoginCodeExchangeResponse,
  parseRealmIdentity,
  parseUserAvatarResponse
} from "../index";

describe("public auth contracts", () => {
  test("parses the current login exchange response", () => {
    expect(parseLoginCodeExchangeResponse({ sessionCookie: "auth_demo.session_token=value", email: "user@example.com" })).toEqual({
      sessionCookie: "auth_demo.session_token=value",
      email: "user@example.com"
    });
    expect(parseLoginCodeExchangeResponse({ email: "user@example.com" })).toBeNull();
  });

  test("rejects incomplete realm identities", () => {
    expect(parseRealmIdentity({ sub: "user-1", project: "demo", email_verified: true })).toEqual({
      id: "user-1",
      realm: "demo",
      name: "",
      image: null,
      email: null,
      emailVerified: true,
      telegramId: null
    });
    expect(parseRealmIdentity({ sub: "user-1" })).toBeNull();
  });

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
