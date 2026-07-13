import { describe, expect, test } from "bun:test";

import { AuthConnectionKind, ServicePermission } from "../model";
import {
  parseAuthConnectionCreate,
  parseAuthConnectionUpdate
} from "../validator";

describe("authentication connection input", () => {
  test("normalizes a product backend without accepting OAuth configuration", () => {
    expect(
      parseAuthConnectionCreate({
        kind: AuthConnectionKind.Application,
        name: "  Demo App  ",
        backendUrl: "https://api.demo.example.com/",
        scopes: ["admin"]
      })
    ).toBeNull();

    expect(
      parseAuthConnectionCreate({
        kind: AuthConnectionKind.Application,
        name: "  Demo App  ",
        backendUrl: "https://api.demo.example.com/"
      })
    ).toEqual({
      kind: AuthConnectionKind.Application,
      name: "Demo App",
      backendUrl: "https://api.demo.example.com"
    });
  });

  test("accepts only named service permissions", () => {
    expect(
      parseAuthConnectionCreate({
        kind: AuthConnectionKind.Service,
        name: " Demo Worker ",
        permissions: [
          ServicePermission.BillingUsageWrite,
          ServicePermission.BillingUsageWrite
        ]
      })
    ).toEqual({
      kind: AuthConnectionKind.Service,
      name: "Demo Worker",
      permissions: [ServicePermission.BillingUsageWrite]
    });

    expect(
      parseAuthConnectionCreate({
        kind: AuthConnectionKind.Service,
        name: "Demo Worker",
        permissions: ["billing:usage:write"]
      })
    ).toBeNull();
  });

  test("limits updates to the display name", () => {
    expect(parseAuthConnectionUpdate({})).toBeNull();
    expect(
      parseAuthConnectionUpdate({
        name: "Demo App",
        redirectUris: ["https://attacker.example.com/callback"]
      })
    ).toBeNull();
    expect(parseAuthConnectionUpdate({ name: " Updated Demo App " })).toEqual({
      name: "Updated Demo App"
    });
  });
});
