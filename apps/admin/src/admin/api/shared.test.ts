import { describe, expect, spyOn, test } from "bun:test";

import {
  adminFetch,
  AdminSessionState,
  subscribeAdminSession
} from "./shared";

describe("admin API session boundary", () => {
  test("broadcasts unauthorized responses before protected data can remain visible", async () => {
    const states: AdminSessionState[] = [];
    const unsubscribe = subscribeAdminSession((state) => states.push(state));
    const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 401 })
    );

    try {
      await expect(adminFetch("https://auth.example.com/admin/api/projects"))
        .rejects.toMatchObject({ name: "UnauthorizedError" });
      expect(states).toEqual([AdminSessionState.Unauthorized]);
    } finally {
      unsubscribe();
      fetchMock.mockRestore();
    }
  });
});
