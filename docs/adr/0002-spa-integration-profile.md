# ADR 0002: SPA Integration Profile with Browser Tokens

- Status: Proposed
- Date: 2026-07-14

## Context

ADR 0001 made Better Auth the only owner of the authentication protocol and
left exactly one product integration shape: a confidential relying party with
its own Better Auth instance (BFF). Its recorded consequence: "Product
applications need a small Better Auth server/BFF even when their UI is a
browser application."

That consequence contradicts the platform's product goal. The platform exists
to make app integration Supabase-simple: install one SDK in a browser app,
point it at the realm, done. Requiring every product — including static SPAs
and Mini Apps without a backend — to run its own auth server, database, and
migrations is the single largest integration cost and reproduces the kind of
setup burden the platform was built to remove.

The server side already supports the missing shape. Realms expose an OAuth
2.1/OIDC provider with public clients (`token_endpoint_auth_method: "none"`,
`authorization_code` + `refresh_token` grants, forced PKCE), per-realm JWKS,
short-lived JWT access tokens, and hosted login/consent UI. MCP clients
already use exactly this profile.

## Decision

The platform supports one product integration profile: a public OAuth
client with PKCE ("Profile B" below). It is a Better Auth-owned protocol
flow and does not reintroduce a platform login protocol.

### Profile A: Backend (retired)

The confidential web client with its own Better Auth instance and Generic
OAuth, as specified by ADR 0001, is retired as a supported integration
profile. No current or planned product uses it: browser apps and apps with
backends use Profile B directly (a product backend verifies the JWT against
the realm JWKS and needs no session of its own), and Amela — a native
Expo/React Native app with a Node backend — cannot hold a client secret at
all. Amela migrates from the legacy `auth-client`/`auth-server` SDK
straight to Profile B (system-browser hosted login, deep-link redirect,
tokens in secure device storage, backend as a JWKS-verifying resource
server), superseding the reference-product-pattern migration plan in
`TODO.md`. Keeping a second documented path would double the docs,
examples, and support surface for zero consumers.

Because no product consumes the service yet, retirement is immediate — there
is no migration window to protect. Removal covers
`@nezdemkovski/auth-integration`, the legacy `auth-client`/`auth-server`
packages, the reference product's Generic OAuth example, the Profile A
material in `docs/SDK.md`, and the web-confidential option from the admin
Connect flow. The reference product is rebuilt as the SPA + resource-server
example alongside the new SDK. Amela integrates fresh on Profile B; nothing
is migrated.

What this does not remove: service credentials (`client_credentials`
Backend API keys) are unrelated to Profile A and stay. The OAuth provider's
native ability to serve confidential clients also stays; a future adopter
with a hard "no tokens in the browser" policy or a server-rendered app with
no JS token holder can be supported again with a thin integration recipe,
without platform changes.

### Profile B: SPA (the supported profile)

A public OAuth client with PKCE. The product browser app uses the platform
browser SDK to:

- redirect to the realm's hosted login page (authorization code + PKCE);
- exchange the code at the realm token endpoint without a client secret;
- hold the access token in memory and the rotating refresh token in browser
  storage;
- refresh proactively and expose the current access token to product code;
- call product backends that verify the JWT against the realm JWKS.

Access tokens stay short-lived (15 minutes). Refresh tokens must rotate. The
product backend, when it exists, is a pure resource server: it verifies
issuer, audience, and signature via JWKS and keys its data by `issuer + sub`.
No product Better Auth instance, auth tables, or migrations are required.

### Protocol ownership boundary

The browser SDK does not implement OAuth. Protocol mechanics (authorization
request, PKCE, code exchange, refresh) are delegated to a certified standards
library (`oauth4webapi` or equivalent) driven by the realm's discovery
document. The SDK owns only storage choice, refresh scheduling, multi-tab
session broadcast, and typed platform identity extraction.

### Amendment to ADR 0001

The ADR 0001 prohibition on "browser access-token storage or refresh state
machines" is narrowed: it prohibits platform-invented token protocols. A
public OAuth client consuming Better Auth-issued tokens through a standards
library is the intended design for Profile B.

## Accepted Trade-off

Tokens in the browser can be stolen by XSS in the product app. This matches
the security model of Supabase, Firebase Auth, and Auth0 SPA SDKs and is
accepted platform-wide. Mitigations: 15-minute access tokens, rotating
refresh tokens, in-memory access-token storage on the web, secure device
storage on native.

## Verification Before Release

- [x] The pinned Better Auth release issues rotating refresh tokens and
      revokes the token family on refresh-token reuse. Verified in
      `@better-auth/oauth-provider@1.7.0-rc.1`: each refresh creates a new
      `oauthRefreshToken` row and revokes the original with a conditional
      update guarding `revoked: null` (concurrent reuse fails closed), and a
      revoked-token replay triggers `invalidateRefreshFamily`. Upstream notes
      a non-atomic family-invalidation race in a code TODO; acceptable, track
      on upgrades.
- [x] The realm token endpoint answers CORS preflight for realm trusted
      origins. Verified: the CORS middleware in
      `apps/api/src/modules/auth-proxy/http.ts` covers `/api/:project/auth/*`
      (which includes `oauth2/token`), reflects trusted origins, and allows
      OPTIONS and the Authorization header. The SPA origin must be in the
      realm's trusted origins.
- [ ] `offline_access` exists in the platform scope set
      (`oauth-resource/src/model.ts`); wire it into the scopes granted to
      admin-created SPA clients when building the Connect flow.
- [ ] Hosted login preserves the signed OAuth query end to end for public
      clients, with regression coverage for Profile B.
- [ ] The admin Connect flow can create an SPA connection that returns issuer
      and client id only, with no secret.
- [ ] Integration test covers the SPA-profile code+PKCE exchange, refresh
      rotation, and JWKS verification by a sample resource server.

## Consequences

- New public browser SDK package (working name `@nezdemkovski/auth-spa`,
  with a native/Expo entry) and optionally a small JWKS verification helper
  for product backends.
- The admin "Connect your app" section creates an SPA connection (issuer +
  client id, no secret) as the only app option.
- `docs/SDK.md` is rewritten around the single profile.
- The reference product becomes an SPA + resource-server example.
- `@nezdemkovski/auth-integration` and the legacy `auth-client`/`auth-server`
  packages are deleted outright; Amela adopts Profile B directly.
