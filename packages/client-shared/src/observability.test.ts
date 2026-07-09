import { describe, expect, test } from "bun:test";

import { sanitizeObservabilityUrl } from "./observability";

describe("browser observability URL sanitization", () => {
  test("removes recovery and OAuth credentials while preserving routing context", () => {
    expect(
      sanitizeObservabilityUrl(
        "https://auth.example.com/login/demo/reset-password?token=secret&error=expired"
      )
    ).toBe(
      "https://auth.example.com/login/demo/reset-password?error=expired"
    );
    expect(
      sanitizeObservabilityUrl(
        "https://auth.example.com/login/demo/oauth/consent?client_id=demo&code=secret&state=secret"
      )
    ).toBe(
      "https://auth.example.com/login/demo/oauth/consent?client_id=demo"
    );
  });
});
