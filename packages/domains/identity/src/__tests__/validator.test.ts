import { describe, expect, test } from "bun:test";

import {
  parseAdminProfilePatch,
  parseChangePasswordInput,
  parseResendVerificationEmail
} from "../validator";

describe("identity validators", () => {
  test("normalizes identity emails at the untrusted input boundary", () => {
    expect(parseResendVerificationEmail({ email: " User@Example.com " })).toBe(
      "user@example.com"
    );
    expect(parseAdminProfilePatch({ email: " Admin@Example.com " })).toEqual({
      email: "admin@example.com"
    });
  });

  test("rejects malformed profile and password inputs", () => {
    expect(parseResendVerificationEmail({ email: "not-an-email" })).toBeNull();
    expect(parseAdminProfilePatch({ name: " " })).toBeNull();
    expect(
      parseChangePasswordInput({ currentPassword: "current", newPassword: 123 })
    ).toBeNull();
  });
});
