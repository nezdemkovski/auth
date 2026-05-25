import { describe, expect, test } from "bun:test";

import { storageEndpointProtocolIsAllowed } from "../settings-store";

describe("storage settings", () => {
  test("requires HTTPS for user-configured storage endpoints", () => {
    expect(
      storageEndpointProtocolIsAllowed(new URL("https://s3.example.com"), {
        allowHttpEndpoint: false
      })
    ).toBe(true);
    expect(
      storageEndpointProtocolIsAllowed(new URL("http://127.0.0.1:9000"), {
        allowHttpEndpoint: false
      })
    ).toBe(false);
    expect(
      storageEndpointProtocolIsAllowed(new URL("http://rustfs:9000"), {
        allowHttpEndpoint: true
      })
    ).toBe(true);
  });
});
