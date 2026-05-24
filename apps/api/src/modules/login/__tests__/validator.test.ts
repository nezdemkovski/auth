import { describe, expect, test } from "bun:test";

import {
  parseLoginCodeExchangeInput,
  parseLoginSessionCodeInput
} from "../validator";

describe("login validators", () => {
  test("rejects malformed session-code bodies", () => {
    expect(parseLoginSessionCodeInput(null)).toBeNull();
    expect(parseLoginSessionCodeInput({ redirect_uri: "https://app.example/cb" })).toBeNull();
    expect(
      parseLoginSessionCodeInput({
        redirect_uri: "https://app.example/cb",
        code_challenge: "A".repeat(43),
        state: "state"
      })
    ).toEqual({
      redirectUri: "https://app.example/cb",
      codeChallenge: "A".repeat(43),
      state: "state"
    });
  });

  test("rejects malformed token exchange bodies", () => {
    expect(
      parseLoginCodeExchangeInput({
        code: "code",
        redirect_uri: "https://app.example/cb"
      })
    ).toBeNull();
    expect(
      parseLoginCodeExchangeInput({
        code: "code",
        redirect_uri: "https://app.example/cb",
        code_verifier: "A".repeat(43)
      })
    ).toEqual({
      code: "code",
      redirectUri: "https://app.example/cb",
      codeVerifier: "A".repeat(43)
    });
  });
});
