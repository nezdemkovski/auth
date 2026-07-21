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

Billing and avatar operations live under `@nezdemkovski/auth/billing` and
`@nezdemkovski/auth/storage`. They reuse the same client without exposing OAuth
scopes, resource URLs, or Better Auth internals to the product.
