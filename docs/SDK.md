# Better Auth Product Integration

Product applications use Better Auth directly. This repository publishes only
the platform-specific pieces that Better Auth cannot know:

```text
@nezdemkovski/auth-integration  Thin server-side provider config and identity helpers
@nezdemkovski/auth-contracts    Stable DTOs for platform-owned business resources
```

There is intentionally no product auth client or token-verification wrapper.
The former `@nezdemkovski/auth-client@0.1.0` and
`@nezdemkovski/auth-server@0.1.0` implement a parallel session and token state
machine and must not be used for new integrations.

## Product server

Install Better Auth and the thin integration package:

```bash
bun add better-auth @nezdemkovski/auth-integration
```

Configure the central realm as a Generic OAuth provider in the product's own
Better Auth instance:

```ts
import { createAuthPlatformProvider } from "@nezdemkovski/auth-integration";
import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";

export const auth = betterAuth({
  baseURL: "https://demo.example.com",
  database,
  plugins: [
    genericOAuth({
      config: [
        createAuthPlatformProvider({
          issuer: "https://auth.example.com/api/demo",
          clientId: env.AUTH_CLIENT_ID,
          clientSecret: env.AUTH_CLIENT_SECRET
        })
      ]
    })
  ]
});
```

Mount `auth.handler` under the product application's Better Auth route. Better
Auth owns authorization-code exchange, PKCE, provider token storage, refresh,
account linking, and the product's HttpOnly session cookie.

## Product browser

The browser talks only to the product application's Better Auth client:

```ts
import { createAuthClient } from "better-auth/client";

const authClient = createAuthClient({
  baseURL: "https://demo.example.com"
});

await authClient.signIn.social({
  provider: "auth-platform",
  callbackURL: "https://demo.example.com/signed-in"
});
```

Do not store or relay central access tokens, refresh tokens, session cookies, or
PKCE state in product browser code.

Telegram is configured once on the central realm as an OIDC social provider.
Products do not install a Telegram auth SDK or handle Mini App `initData`.
Starting Telegram from the hosted login page uses the same
`signIn.social({ provider: "telegram" })` Better Auth flow as every other
central provider, including when the product is open inside a Mini App webview.
The realm callback registered with Telegram is:

```text
https://auth.example.com/api/<realm>/auth/oauth2/callback/telegram
```

## Stable central identity

On the product server, read the linked provider account and extract its stable
central identity:

```ts
import { readAuthPlatformIdentity } from "@nezdemkovski/auth-integration";

const identity = readAuthPlatformIdentity(accounts, {
  issuer: "https://auth.example.com/api/demo"
});
```

Persist the `issuer + subject` pair. Email is mutable profile data and is not a
cross-system identity key.

## Calling platform resources

Any platform capability retained for cross-product use must be registered as an
OAuth resource with explicit scopes. Its resource server verifies tokens with
Better Auth's official client:

```bash
bun add @better-auth/oauth-provider@1.7.0-rc.1
```

```ts
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";

const { verifyAccessTokenRequest } = oauthProviderResourceClient().getActions();

const claims = await verifyAccessTokenRequest(request, {
  jwksUrl: "https://auth.example.com/api/demo/.well-known/jwks.json",
  verifyOptions: {
    issuer: "https://auth.example.com/api/demo",
    audience: "https://auth.example.com/api/demo/upload"
  },
  scopes: ["storage:avatar:write"]
});
```

Use `verifyAccessTokenRequest` for new integrations so DPoP-bound requests can
also be enforced. After protocol verification, application code owns only its
domain authorization decisions. Do not use this example until the exact
resource and scopes have been registered in the central realm; there is no
session-token compatibility fallback.

The upload resource publishes discovery metadata at
`/.well-known/oauth-protected-resource/api/<realm>/upload`. OAuth clients must
also be linked to that Better Auth resource before requesting its audience.

## Service-only billing mutations

Quota mutation is a backend-to-backend operation. Provision a confidential
Better Auth client with only the `client_credentials` grant, the
`billing:usage:write` scope, and a link to the realm's billing resource. Keep
its secret in the product backend; never send the secret or resulting token to
the browser.

Request the standard Better Auth M2M token:

```ts
const credentials = Buffer.from(
  `${env.AUTH_SERVICE_CLIENT_ID}:${env.AUTH_SERVICE_CLIENT_SECRET}`
).toString("base64");
const tokenResponse = await fetch(
  "https://auth.example.com/api/demo/auth/oauth2/token",
  {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "billing:usage:write",
      resource: "https://auth.example.com/api/demo/billing"
    })
  }
);
const { access_token: accessToken } = await tokenResponse.json();
```

Then pass the central `issuer + subject` mapping already stored by the product
backend. The M2M token's own `sub` identifies the service client; it never
impersonates the user:

```ts
await fetch("https://auth.example.com/api/demo/billing/usage/consume", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID()
  },
  body: JSON.stringify({
    subject: centralIdentity.subject,
    key: "generation_credits",
    amount: 1
  })
});
```

The same contract applies to `reserve`, `commit`, and `release`. User session
cookies and user-delegated OAuth tokens are deliberately rejected on all four
mutation routes.

## Business contracts

`@nezdemkovski/auth-contracts` contains parsers for platform business resource
DTOs such as billing usage and avatar responses. It deliberately does not copy
Better Auth OAuth, token, session, user, or error response types.

## Publishing

Packages are versioned independently and published from immutable tags:

```text
auth-integration-v0.1.0
auth-contracts-v0.2.0
```

The workflow validates that the tag matches the selected package manifest,
runs the complete repository test suite, builds that package, refuses an
existing npm version, and publishes through npm trusted publishing.
