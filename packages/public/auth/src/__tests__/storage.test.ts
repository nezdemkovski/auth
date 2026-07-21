import { describe, expect, test } from "bun:test";

import { createStorageClient } from "../storage";

describe("storage user client", () => {
  test("uploads an avatar with the application access token", async () => {
    const requests: Request[] = [];
    const fakeFetch: typeof fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json({
          user: { image: "https://cdn.example/avatar.jpg" }
        });
      },
      { preconnect: fetch.preconnect }
    );
    const storage = createStorageClient({
      issuer: "https://auth.example.com/api/demo",
      auth: {
        getAccessToken: async () => "user-access-token",
        invalidateAccessToken: () => undefined
      },
      fetch: fakeFetch
    });

    expect(await storage.uploadAvatar(new Blob(["avatar"]))).toBe(
      "https://cdn.example/avatar.jpg"
    );
    expect(requests[0]?.headers.get("authorization")).toBe(
      "Bearer user-access-token"
    );
  });
});
