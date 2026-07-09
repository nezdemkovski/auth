import { describe, expect, test } from "bun:test";

import { isPostgresUniqueViolation } from "../errors";

describe("PostgreSQL errors", () => {
  test("uses the stable SQLSTATE instead of localized error text", () => {
    expect(
      isPostgresUniqueViolation({
        code: "23505",
        message: "duplicate key value violates unique constraint"
      })
    ).toBe(true);
    expect(
      isPostgresUniqueViolation({
        message: "Failed query",
        cause: { code: "23505" }
      })
    ).toBe(true);
    expect(
      isPostgresUniqueViolation(
        new Error("duplicate key value violates unique constraint")
      )
    ).toBe(false);
    expect(isPostgresUniqueViolation({ code: "23503" })).toBe(false);
  });
});
