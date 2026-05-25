import { describe, expect, test } from "bun:test";

import { parseJson } from "../shared";

describe("admin HTTP utils", () => {
  test("returns parsed JSON when request body is valid", async () => {
    const req = new Request("http://auth.local/admin/api/test", {
      method: "POST",
      body: JSON.stringify({ ok: true })
    });

    expect(await parseJson(req)).toEqual({ ok: true });
  });

  test("returns fallback when request body is malformed", async () => {
    const req = new Request("http://auth.local/admin/api/test", {
      method: "POST",
      body: "{"
    });

    expect(await parseJson(req)).toEqual({});
  });
});
