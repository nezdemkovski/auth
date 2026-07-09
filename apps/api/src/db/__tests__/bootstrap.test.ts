import { describe, expect, test } from "bun:test";

import { generateTemporaryAdminPassword } from "../bootstrap";

describe("admin bootstrap", () => {
  test("generates a strong temporary credential for first-start output", () => {
    const first = generateTemporaryAdminPassword();
    const second = generateTemporaryAdminPassword();

    expect(first).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(second).not.toBe(first);
  });
});
