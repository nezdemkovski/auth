import { describe, expect, test } from "bun:test";

import { AuthConnectionKind } from "../../../../types";
import {
  buildAuthConnectionEnvironment,
  buildRealmSetupEnvironment
} from "../environment";

describe("connection environment", () => {
  test("builds the complete realm onboarding block", () => {
    expect(
      buildRealmSetupEnvironment({
        issuer: "https://auth.example.com/api/demo",
        clientId: "app-client",
        clientSecret: "app-secret"
      })
    ).toBe(
      "AUTH_ISSUER=https://auth.example.com/api/demo\n" +
        "AUTH_CLIENT_ID=app-client\n" +
        "AUTH_CLIENT_SECRET=app-secret"
    );
  });

  test("builds copy-ready app backend variables", () => {
    expect(
      buildAuthConnectionEnvironment({
        issuer: "https://auth.example.com/api/demo",
        kind: AuthConnectionKind.Application,
        credential: {
          clientId: "app-client",
          clientSecret: "app-secret"
        }
      })
    ).toBe(
      "AUTH_ISSUER=https://auth.example.com/api/demo\n" +
        "AUTH_CLIENT_ID=app-client\n" +
        "AUTH_CLIENT_SECRET=app-secret"
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
