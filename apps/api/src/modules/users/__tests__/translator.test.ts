import { describe, expect, test } from "bun:test";

import { projectUserResponse } from "../translator";

describe("users translator", () => {
  test("serializes user date fields as ISO strings", () => {
    expect(
      projectUserResponse({
        id: "user-id",
        email: "user@example.com",
        name: "User",
        role: null,
        banned: null,
        emailVerified: true,
        createdAt: new Date("2026-05-25T10:00:00.000Z"),
        updatedAt: "2026-05-25T11:00:00.000Z",
        sessionCount: 2
      })
    ).toEqual({
      id: "user-id",
      email: "user@example.com",
      name: "User",
      role: null,
      banned: false,
      emailVerified: true,
      createdAt: "2026-05-25T10:00:00.000Z",
      updatedAt: "2026-05-25T11:00:00.000Z",
      sessionCount: 2
    });
  });
});
