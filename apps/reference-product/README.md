# Reference product

This private app is the executable integration pattern for web products that
use a central auth realm.

It deliberately has two distinct authentication boundaries:

- the central realm is an OAuth 2.1 / OpenID Connect provider;
- this product is a confidential relying party with its own Better Auth
  session cookie.

The browser starts a normal Better Auth social sign-in and receives only the
product session. Better Auth owns discovery, state, PKCE, the authorization
code exchange, provider tokens, refresh, and the local session.

The executable example uses Better Auth's memory adapter to stay self-contained.
A deployed product must replace it with its durable database adapter; the OAuth
and session architecture stays the same.

## Run

```bash
AUTH_ISSUER=https://auth.example.com/api/demo \
AUTH_CLIENT_ID=... \
AUTH_CLIENT_SECRET=... \
BETTER_AUTH_SECRET=replace-with-at-least-32-characters \
bun run dev
```

The configured central OAuth client must allow this callback URL:

```text
http://127.0.0.1:3010/api/auth/callback/auth-platform
```

`GET /api/me` demonstrates the product boundary: it authenticates the local
Better Auth session and exposes only the stable central `issuer + sub`
identity. It never returns provider access or refresh tokens.
