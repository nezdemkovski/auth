import { describe, expect, test } from "bun:test";

import { createBillingClient, createBillingService } from "../billing";

const accessTokenSource = {
  getAccessToken: async () => "user-access-token",
  invalidateAccessToken: () => undefined
};

describe("billing service client", () => {
  test("uses client credentials for the complete reservation lifecycle", async () => {
    const requests: Request[] = [];
    const fakeFetch: typeof fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url.endsWith("/.well-known/openid-configuration")) {
          return Response.json({
            issuer: "https://auth.example.com/api/demo",
            authorization_endpoint:
              "https://auth.example.com/api/demo/auth/oauth2/authorize",
            token_endpoint:
              "https://auth.example.com/api/demo/auth/oauth2/token"
          });
        }
        if (request.url.endsWith("/auth/oauth2/token")) {
          return Response.json({
            access_token: "service-access-token",
            token_type: "Bearer",
            expires_in: 300
          });
        }
        if (request.url.endsWith("/billing/usage/reserve")) {
          return Response.json({
            allowed: true,
            reservationId: "reservation-123456",
            summary: {
              key: "messages",
              used: 1,
              limit: 10,
              remaining: 9,
              unlimited: false
            }
          });
        }
        if (request.url.endsWith("/billing/usage/release")) {
          return Response.json({
            released: true,
            summary: {
              key: "messages",
              used: 0,
              limit: 10,
              remaining: 10,
              unlimited: false
            }
          });
        }
        return Response.json({
          allowed: true,
          summary: {
            key: "messages",
            used: 1,
            limit: 10,
            remaining: 9,
            unlimited: false
          }
        });
      },
      { preconnect: fetch.preconnect }
    );
    const billing = createBillingService({
      issuer: "https://auth.example.com/api/demo",
      clientId: "service-client",
      clientSecret: "service-secret",
      fetch: fakeFetch
    });

    const result = await billing.consumeUsage({
      subject: "user-1",
      key: "messages",
      idempotencyKey: "message-1"
    });

    expect(result.summary.remaining).toBe(9);
    expect(await requests[1]?.text()).toContain("resource=https");
    expect(requests[2]?.headers.get("authorization")).toBe(
      "Bearer service-access-token"
    );
    expect(await requests[2]?.json()).toEqual({
      subject: "user-1",
      key: "messages",
      amount: 1
    });

    const reservation = await billing.reserveUsage({
      subject: "user-1",
      key: "messages",
      idempotencyKey: "message-reserve-0001"
    });
    expect(reservation.reservationId).toBe("reservation-123456");
    expect(requests[3]?.headers.get("idempotency-key")).toBe(
      "message-reserve-0001"
    );

    await billing.commitUsage({
      subject: "user-1",
      reservationId: "reservation-123456"
    });
    expect(await requests[4]?.json()).toEqual({
      subject: "user-1",
      reservationId: "reservation-123456"
    });

    const released = await billing.releaseUsage({
      subject: "user-1",
      reservationId: "reservation-123456"
    });
    expect(released.released).toBe(true);
    expect(requests[5]?.url).toEndWith("/billing/usage/release");
  });
});

describe("billing user client", () => {
  test("loads usage and creates checkout through the application resource", async () => {
    const requests: Request[] = [];
    const fakeFetch: typeof fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url.includes("usage/summary")) {
          return Response.json({
            summary: {
              key: "messages",
              used: 2,
              limit: 10,
              remaining: 8,
              unlimited: false
            }
          });
        }
        return Response.json({ url: "https://checkout.example/session" });
      },
      { preconnect: fetch.preconnect }
    );
    const billing = createBillingClient({
      issuer: "https://auth.example.com/api/demo",
      auth: accessTokenSource,
      fetch: fakeFetch
    });

    expect((await billing.getUsageSummary("messages")).remaining).toBe(8);
    expect(await billing.createCheckout("pro")).toBe(
      "https://checkout.example/session"
    );
    expect(requests[0]?.headers.get("authorization")).toBe(
      "Bearer user-access-token"
    );
    expect(await requests[1]?.json()).toEqual({ slug: "pro" });
  });
});
