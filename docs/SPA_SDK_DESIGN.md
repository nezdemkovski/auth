# SPA SDK Design

Status: superseded by [`AUTH_SDK_DESIGN.md`](AUTH_SDK_DESIGN.md).

This document is retained as historical context for ADR 0002. Its proposed
`@nezdemkovski/auth-spa` package name and SPA-only public API are no longer the
implementation target.

Telegram Mini App authentication is also outside this historical SPA design.
The current decision is the realm-scoped launch-data plugin described in
[`TELEGRAM_MINI_APP_AUTH.md`](TELEGRAM_MINI_APP_AUTH.md), not Telegram hosted
login inside a webview.

## Goal

`bun add @nezdemkovski/auth-spa`, pass issuer and client id, get working
sign-in in a browser app. The platform owns all auth UI and protocol
machinery; the SDK wraps realm endpoints and manages tokens.

```ts
import { createAuthSpaClient } from "@nezdemkovski/auth-spa";

const auth = createAuthSpaClient({
  issuer: "https://auth.example.com/api/demo",
  clientId: "..."
});
```

## Non-Goals

- No protocol implementation. OAuth mechanics (authorization request, PKCE,
  code exchange, refresh, revocation) are delegated to `oauth4webapi` driven
  by the realm's OIDC discovery document.
- No login UI components. The hosted login page owns credentials, social,
  passkeys, and 2FA. The SDK only redirects to it.
- No confidential-client path. Profile A is retired outright (ADR 0002);
  this SDK plus JWKS verification on product backends is the only supported
  integration. `@nezdemkovski/auth-integration` and the legacy
  `auth-client`/`auth-server` packages are deleted, not migrated.

## API Surface

```ts
type AuthSpaClientOptions = {
  issuer: string;
  clientId: string;
  redirectUri?: string;        // default: `${location.origin}/auth/callback`
  scopes?: string[];           // default: openid profile email offline_access
  refreshTokenStorage?: "local" | "session" | "memory"; // default: "local"
};

const auth = createAuthSpaClient(options);

await auth.signIn({ returnTo?: string });
// Full-page redirect to the realm hosted login with code + PKCE.
// If a central session already exists on the auth origin, the user bounces
// straight back without re-entering credentials (realm-level SSO for free).

await auth.handleCallback();
// Call on the redirect URI route. Exchanges code for tokens, restores
// returnTo, cleans the URL.

auth.getSession();
// { user: { id, email, name, image, emailVerified }, expiresAt } | null
// Derived from the validated ID token. `user.id` is the stable central
// subject; products key their data by issuer + sub, never email.

await auth.getAccessToken();
// Fresh JWT for calling product backends / platform resources.
// Refreshes automatically when close to expiry.

await auth.signOut({ everywhere?: boolean });
// Revokes the refresh token, clears storage, broadcasts to other tabs.
// `everywhere: true` additionally redirects through central logout.

auth.subscribe(listener);
// Session change events, including cross-tab.
```

React companion (same package, subpath export):

```ts
import { AuthProvider, useAuth } from "@nezdemkovski/auth-spa/react";

const { session, signIn, signOut, getAccessToken } = useAuth();
```

## Token Handling

- Access token: memory only, never persisted.
- Refresh token: `localStorage` by default (key `auth.<realm>.<clientId>`),
  rotated on every refresh. A rotation-reuse error from the server means the
  family was revoked or stolen: hard sign-out and notify subscribers.
- Reload bootstrap: if a refresh token exists on init, perform a silent
  refresh to rebuild the session before the first `getSession()` resolves.
- Proactive refresh: schedule at ~75% of access-token lifetime; also refresh
  on demand inside `getAccessToken()` when less than 60s remain.
- Multi-tab: `BroadcastChannel` for session events; Web Locks API mutex so
  only one tab refreshes and others adopt the result.

## Product Backend (Optional)

A product backend is a pure resource server. Verification is standard JWKS:

```ts
import { createRemoteJWKSet, jwtVerify } from "jose";

const jwks = createRemoteJWKSet(
  new URL("https://auth.example.com/api/demo/.well-known/jwks.json")
);
const { payload } = await jwtVerify(token, jwks, {
  issuer: "https://auth.example.com/api/demo",
  audience: "demo"
});
```

Decide during review whether to ship this as a helper in
`@nezdemkovski/auth-integration` or keep it as documented `jose` usage.

## Server-Side Work Required

1. CORS: the realm token (and revocation) endpoints must answer preflight for
   realm trusted origins. The auth proxy already reflects trusted origins for
   auth routes; verify the OAuth provider paths are covered.
2. Refresh rotation: verify the pinned Better Auth issues rotating refresh
   tokens to public clients (ADR 0002 verification list).
3. Admin Connect flow: add the SPA option that creates a Public-profile
   client (`policy.ts` already supports it) and returns issuer + client id.
4. Scope policy: confirm `offline_access` is in the grantable scope set for
   admin-created public clients.
5. Reference product: add an SPA example app next to the existing backend
   example; extend the integration suite with the Profile B flow.

## Native Target (Expo / React Native)

Profile B is also the correct profile for native apps (public client, PKCE,
no secret) — Amela is the first consumer. The web mechanics do not transfer
directly: no BroadcastChannel, no localStorage, redirects go through the
system browser. Plan a `@nezdemkovski/auth-spa/expo` entry (or sibling
package) that keeps the same `signIn` / `getSession` / `getAccessToken` /
`signOut` surface but delegates the redirect dance to `expo-auth-session`,
uses a deep-link redirect URI, and stores the refresh token in
`expo-secure-store` (Keychain/Keystore). The realm's public client must
register the app's deep-link scheme among its redirect URIs.

## Open Questions

- Redirect only in v1, or also popup flow? (Lean: redirect only; popups fight
  browsers.)
- Package layout for the native target: subpath export vs separate package,
  and how much protocol code is shared with the web entry.
- Does `signOut({ everywhere: true })` need RP-initiated logout metadata on
  the provider, or is clearing the central session cookie via redirect
  enough?
