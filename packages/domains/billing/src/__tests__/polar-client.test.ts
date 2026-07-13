import { describe, expect, test } from "bun:test";

import { polarErrorMessage } from "../polar-client";

describe("Polar client helpers", () => {
  test("maps JSON API errors into stable messages", () => {
    expect(
      polarErrorMessage(
        {
          statusCode: 401,
          body: JSON.stringify({
            error: "invalid_token",
            error_description: "Token is invalid"
          })
        },
        "fallback"
      )
    ).toBe("Polar 401: Token is invalid");
  });

  test("maps validation detail arrays into readable messages", () => {
    expect(
      polarErrorMessage(
        {
          statusCode: 422,
          body: JSON.stringify({
            detail: [
              {
                loc: ["body", "organization_id"],
                msg: "Setting organization_id is disallowed"
              }
            ]
          })
        },
        "fallback"
      )
    ).toBe(
      "Polar 422: body.organization_id: Setting organization_id is disallowed"
    );
  });
});
