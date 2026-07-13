# `@nezdemkovski/auth-integration`

Thin Better Auth configuration for product backends that use a central auth
realm as their OpenID Connect provider.

It does not own a session, OAuth exchange, PKCE implementation, token cache,
refresh loop, or authenticated fetch wrapper.

## Better Auth server configuration

```ts
import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { createAuthPlatformProvider } from "@nezdemkovski/auth-integration";

export const auth = betterAuth({
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

The product frontend uses its product Better Auth client and local HttpOnly
session. It does not import this package and never receives central provider
tokens.

Pass `resource` only after that exact resource has been created in Better Auth
and linked to the OAuth client. Browser trusted origins are not OAuth resource
identifiers.

## Platform resources

Use the exported conventions instead of copying audience and scope strings
between product backends:

```ts
import {
  AuthPlatformResource,
  AuthPlatformResourceScope,
  authPlatformResourceIdentifier
} from "@nezdemkovski/auth-integration";

const billingResource = authPlatformResourceIdentifier(
  "https://auth.example.com/api/demo",
  AuthPlatformResource.Billing
);
const billingWriteScope = AuthPlatformResourceScope.BillingUsageWrite;
```

The package deliberately does not exchange, cache, refresh, or persist OAuth
tokens. Product backends use Better Auth's standard OAuth endpoints and keep
service credentials in their own secret manager.

## Central identity

Use `readAuthPlatformIdentity` on the server with accounts returned by Better
Auth. It returns the stable central `issuer + sub` identity. Do not use email as
the cross-system identity key.
