import { describe, expect, spyOn, test } from "bun:test";

import { getLoginNextAction } from "./auth-client";

describe("hosted login server decisions", () => {
  test("fails closed when the server cannot provide a next action", async () => {
    const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ error: "unavailable" }, { status: 503 })
    );

    try {
      await expect(getLoginNextAction("demo")).resolves.toBeNull();
    } finally {
      fetchMock.mockRestore();
    }
  });
});
