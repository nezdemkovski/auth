import { describe, expect, test } from "bun:test";
import { ObservabilityComponent } from "@nezdemkovski/auth-observability";

import { inferObservabilityContext } from "../http";

describe("observability HTTP context", () => {
  test("keeps the realm tag while normalizing the captured request path", () => {
    const context = inferObservabilityContext(
      new Request("https://auth.example.test/api/demo/auth/get-session", {
        method: "POST"
      })
    );

    expect(context).toEqual({
      component: ObservabilityComponent.Api,
      method: "POST",
      path: "/api/:project/auth/get-session",
      projectSlug: "demo",
      routeArea: "auth-proxy"
    });
  });
});
