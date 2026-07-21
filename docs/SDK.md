# Product integration

A normal product installs one package and copies two values from its realm:

```bash
bun add @nezdemkovski/auth
```

```dotenv
AUTH_ISSUER=https://auth.example.com/api/demo
AUTH_CLIENT_ID=...
```

There is no client secret for user login. The SDK derives discovery URLs,
scopes, resource audience, JWKS, PKCE, refresh, and revocation details from the
issuer.

## Application client

The same import works in a browser and Expo. Package export conditions select
the correct implementation.

```ts
import { createAuthClient } from "@nezdemkovski/auth/client";

const auth = createAuthClient({
  issuer: env.AUTH_ISSUER,
  clientId: env.AUTH_CLIENT_ID
});

await auth.initialize();
await auth.signIn({ returnTo: "/chats" });
await auth.handleCallback();

const session = auth.getSession();
const accessToken = await auth.getAccessToken();
```

Send the access token to the product backend as `Authorization: Bearer ...`.
The browser implementation keeps access tokens in memory and uses standard
OIDC Authorization Code with PKCE. Expo opens the hosted realm login and keeps
the refresh credential in SecureStore.

## Product backend

The backend is a resource server. It does not create another auth instance or
another product session.

```ts
import { createAuthServer } from "@nezdemkovski/auth/server";

const auth = createAuthServer({
  issuer: env.AUTH_ISSUER,
  clientId: env.AUTH_CLIENT_ID
});

const identity = await auth.verifyRequest(request);
```

`identity.issuer + identity.subject` is the stable user identity. Email and
name are profile fields and must not be used as cross-system identifiers.

The server SDK uses Better Auth's official resource-server verifier and checks
signature, issuer, application audience, expiry, client id, and user token
kind.

## Billing and storage

Billing and avatar operations are separate modules in the same npm package. They
reuse the application access token and keep endpoint details out of the product:

```ts
import { createBillingClient } from "@nezdemkovski/auth/billing";
import { createStorageClient } from "@nezdemkovski/auth/storage";

const billing = createBillingClient({ issuer: env.AUTH_ISSUER, auth });
const storage = createStorageClient({ issuer: env.AUTH_ISSUER, auth });

await billing.getUsageSummary("messages");
const checkoutUrl = await billing.createCheckout("pro");
const portalUrl = await billing.createPortal();
await storage.uploadAvatar(file);
```

User-facing reads and avatar operations use the same application access token.
The SDK requests their scopes internally; the product does not configure
audiences or scopes.

## Optional server credentials

User login never needs a secret. A backend needs a separate service credential
only for machine-only operations such as consuming billing quota:

```dotenv
AUTH_SERVICE_CLIENT_ID=...
AUTH_SERVICE_CLIENT_SECRET=...
```

Those credentials use Better Auth's standard `client_credentials` grant,
belong to one realm, and must never enter browser or native code.

## Publishing

The package is released from an immutable matching tag:

```text
auth-v0.1.2
```

The release workflow runs the repository tests, builds the package, checks its
tarball, refuses an existing version, and publishes through npm trusted
publishing.
