# @nezdemkovski/auth

One SDK for applications connected to a Nezdemkovski auth realm.

```ts
import { createAuthClient } from "@nezdemkovski/auth/client";

const auth = createAuthClient({
  issuer: process.env.AUTH_ISSUER!,
  clientId: process.env.AUTH_CLIENT_ID!
});
```

Use `@nezdemkovski/auth/server` in an application backend to verify the access
tokens issued for that same realm.

An OAuth resource such as MCP can accept user tokens from dynamically
registered clients by declaring its audience instead of an application client:

```ts
import { createAuthServer } from "@nezdemkovski/auth/server";

const mcpAuth = createAuthServer({
  issuer: process.env.AUTH_ISSUER!,
  resource: "https://app.example.com/mcp"
});
```

Audience, issuer, signature, and user-token checks still apply; only the client
id is intentionally not pinned for this resource-server mode.

Billing and avatar operations live under `@nezdemkovski/auth/billing` and
`@nezdemkovski/auth/storage`. They reuse the same client without exposing OAuth
scopes, resource URLs, or Better Auth internals to the product.

Trusted backends can use a realm service connection for atomic billing usage:

```ts
import { createBillingService } from "@nezdemkovski/auth/billing";

const billing = createBillingService({
  issuer: process.env.AUTH_ISSUER!,
  clientId: process.env.AUTH_SERVICE_CLIENT_ID!,
  clientSecret: process.env.AUTH_SERVICE_CLIENT_SECRET!
});

const reservation = await billing.reserveUsage({
  subject: userId,
  key: "ai_requests",
  idempotencyKey: requestId
});

if (reservation.allowed && reservation.reservationId) {
  await billing.commitUsage({
    subject: userId,
    reservationId: reservation.reservationId
  });
}
```

Use `releaseUsage` instead of `commitUsage` when the protected operation fails.
