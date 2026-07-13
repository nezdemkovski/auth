# Auth server

Framework-independent validation of realm access tokens against the auth
platform issuer and remote JWKS.

```ts
import { createRealmAuth } from "@nezdemkovski/auth-server";

const auth = createRealmAuth({
  baseUrl: "https://auth.example.com",
  realm: "demo"
});

const identity = await auth.verifyRequest(request);
```

The returned identity is realm-local. Product user provisioning, permissions,
and business data remain the responsibility of the consuming application.
