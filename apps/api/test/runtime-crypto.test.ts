import { describe, expect, test } from "bun:test";

import {
  randomBase64Url,
  randomHex,
  sha256Base64Url,
  sha256Hex
} from "../src/runtime/crypto";

describe("Bun runtime crypto helpers", () => {
  test("hashes with Bun.CryptoHasher", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    expect(sha256Base64Url("abc")).toBe(
      "ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0"
    );
  });

  test("generates URL-safe and hex random values", () => {
    expect(randomBase64Url(24)).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(randomHex(16)).toMatch(/^[a-f0-9]{32}$/);
  });
});
