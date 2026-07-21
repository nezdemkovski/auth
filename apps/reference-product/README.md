# Reference product

This private app is the executable backend pattern for products connected to a
central auth realm. It verifies the access token with `@nezdemkovski/auth/server`
and does not create a second auth system or a second product session.

## Run

```bash
AUTH_ISSUER=https://auth.example.com/api/demo \
AUTH_CLIENT_ID=... \
bun run dev
```

`GET /api/me` demonstrates the resource-server boundary and exposes the stable
central `issuer + sub` identity carried by a valid application access token.
