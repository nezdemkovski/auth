import { describe, expect, test } from "bun:test";

import { hasSignedOAuthQuery } from "./oauth-query";

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
});
