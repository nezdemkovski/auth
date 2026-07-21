import { describe, expect, test } from "bun:test";

import {
  hasSignedOAuthQuery,
  parseOAuthSearch,
  stringifyOAuthSearch
} from "./oauth-query";

describe("hosted login OAuth query", () => {
  test("keeps only Better Auth signed redirect queries in the browser URL", () => {
    expect(
      hasSignedOAuthQuery("?client_id=demo&ba_param=client_id&sig=signature")
    ).toBe(true);
    expect(hasSignedOAuthQuery("?client_id=demo&sig=untrusted-marker")).toBe(
      false
    );
    expect(hasSignedOAuthQuery("?state=legacy-client-state")).toBe(false);
  });

  test("preserves repeated Better Auth signature parameters", () => {
    const search = [
      "ba_iat=1784671200",
      "ba_param=ba_iat",
      "ba_param=ba_param",
      "ba_param=client_id",
      "client_id=demo-client",
      "sig=demo-signature"
    ].join("&");

    const serialized = stringifyOAuthSearch(parseOAuthSearch(search));
    const params = new URLSearchParams(serialized);

    expect(params.getAll("ba_param")).toEqual([
      "ba_iat",
      "ba_param",
      "client_id"
    ]);
    expect(params.get("ba_iat")).toBe("1784671200");
    expect(params.get("client_id")).toBe("demo-client");
    expect(params.get("sig")).toBe("demo-signature");
  });
});
