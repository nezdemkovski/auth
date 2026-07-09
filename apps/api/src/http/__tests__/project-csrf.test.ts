import { describe, expect, test } from "bun:test";

import { isTrustedProjectMutation } from "../project-csrf";

const registry = {
  isTrustedOrigin(project: string, origin: string | undefined) {
    return project === "demo" && origin === "https://demo.example.com";
  }
};

describe("project mutation CSRF protection", () => {
  test("requires a configured origin when browser cookies authenticate a mutation", () => {
    expect(
      isTrustedProjectMutation(
        registry,
        "demo",
        new Headers({
          cookie: "auth_demo.session_token=secret",
          origin: "https://demo.example.com"
        })
      )
    ).toBe(true);
    expect(
      isTrustedProjectMutation(
        registry,
        "demo",
        new Headers({
          cookie: "auth_demo.session_token=secret",
          origin: "https://sibling.example.com"
        })
      )
    ).toBe(false);
    expect(
      isTrustedProjectMutation(
        registry,
        "demo",
        new Headers({ cookie: "auth_demo.session_token=secret" })
      )
    ).toBe(false);
  });

  test("allows non-browser bearer requests without cookies", () => {
    expect(
      isTrustedProjectMutation(
        registry,
        "demo",
        new Headers({ authorization: "Bearer token" })
      )
    ).toBe(true);
  });
});
