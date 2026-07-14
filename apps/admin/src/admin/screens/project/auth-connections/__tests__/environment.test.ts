import { describe, expect, test } from "bun:test";

import { AuthConnectionKind } from "../../../../types";
import {
  buildAuthConnectionEnvironment,
  buildRealmSetupEnvironment
} from "../environment";

describe("connection environment", () => {
  test("builds the complete realm onboarding block without a secret", () => {
    expect(
      buildRealmSetupEnvironment({
        issuer: "https://auth.example.com/api/demo",
        clientId: "app-client"
      })
    ).toBe(
      "AUTH_ISSUER=https://auth.example.com/api/demo\n" +
        "AUTH_CLIENT_ID=app-client"
    );
  });

  test("builds copy-ready app variables without a secret line for public clients", () => {
    expect(
      buildAuthConnectionEnvironment({
        issuer: "https://auth.example.com/api/demo",
        kind: AuthConnectionKind.Application,
        credential: {
          clientId: "app-client"
        }
      })
    ).toBe(
      "AUTH_ISSUER=https://auth.example.com/api/demo\n" +
        "AUTH_CLIENT_ID=app-client"
    );
  });

  test("uses a separate prefix for service credentials", () => {
    expect(
      buildAuthConnectionEnvironment({
        issuer: "https://auth.example.com/api/demo",
        kind: AuthConnectionKind.Service,
        credential: {
          clientId: "service-client",
          clientSecret: "service-secret"
        }
      })
    ).toContain("AUTH_SERVICE_CLIENT_ID=service-client");
  });
});
