import { describe, expect, test } from "bun:test";

import { ObservabilityProvider } from "../model";
import {
  parseObservabilitySettingsPatch,
  validateObservabilitySettingsPatch
} from "../validator";

describe("observability validator", () => {
  test("accepts disabled settings without a DSN", () => {
    const patch = parseObservabilitySettingsPatch({
      provider: ObservabilityProvider.None,
      enabled: false,
      environment: "production"
    });

    if (!patch) {
      throw new Error("Expected settings patch");
    }

    expect(patch).toEqual({
      provider: ObservabilityProvider.None,
      enabled: false,
      environment: "production"
    });
    expect(() => {
      validateObservabilitySettingsPatch(patch, false);
    }).not.toThrow();
  });

  test("requires a Sentry DSN when Sentry is enabled", () => {
    const patch = parseObservabilitySettingsPatch({
      provider: ObservabilityProvider.Sentry,
      enabled: true,
      environment: "production"
    });

    if (!patch) {
      throw new Error("Expected settings patch");
    }

    expect(() => {
      validateObservabilitySettingsPatch(patch, false);
    }).toThrow("Sentry DSN is required");
  });

  test("accepts a valid Sentry DSN", () => {
    const patch = parseObservabilitySettingsPatch({
      provider: ObservabilityProvider.Sentry,
      enabled: true,
      dsn: "https://public@example.sentry.io/123",
      environment: "production"
    });

    if (!patch) {
      throw new Error("Expected settings patch");
    }

    expect(() => {
      validateObservabilitySettingsPatch(patch, false);
    }).not.toThrow();
  });
});
