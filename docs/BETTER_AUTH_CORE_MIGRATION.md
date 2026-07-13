# Better Auth Core Migration

## Status

Migration in progress. No compatibility path in this document is intended to
become permanent.

## Goal

Make Better Auth the only owner of authentication protocol machinery:

- user credentials and accounts;
- authorization-server sessions;
- OAuth clients and client secrets;
- authorization codes and PKCE;
- access, refresh, and ID tokens;
- token refresh, revocation, introspection, and UserInfo;
- OAuth/OIDC discovery and JWKS;
- resource-server token verification.

The auth platform should own realm configuration, hosted UI, product policy,
and reusable business capabilities. It must not implement a second login,
session, token, or OAuth protocol around Better Auth.

## Governing Principle

> Own policy and composition. Do not own protocol machinery that Better Auth
> already provides.

Custom code is appropriate for:

- resolving a realm and constructing its Better Auth instance;
- realm isolation and per-realm database configuration;
- choosing enabled Better Auth plugins, scopes, resources, and claims;
- hosted login, consent, reset, passkey, and 2FA presentation;
- mapping the central `issuer + sub` identity into a product application;
- billing entitlements, storage, delivery, and other platform business APIs;
- admin workflows that call typed Better Auth server APIs.

Custom code is not appropriate for:

- issuing or exchanging authorization codes;
- moving Better Auth session cookies between origins;
- persisting Better Auth session tokens in a product frontend;
- minting a second application access token from a Better Auth session;
- implementing refresh-token or access-token lifecycle management;
- manually implementing OAuth client authentication;
- manually implementing JWT/JWKS verification when Better Auth's resource
  client supports the required flow;
- duplicating Better Auth OAuth response contracts in platform DTO packages.

## Target Architecture

```text
Central auth realm
  Better Auth
    - OAuth 2.1 Provider
    - hosted login and consent UI
    - realm-local users and authorization-server session
    - OAuth clients, grants, tokens, scopes, and resources
             |
             | OIDC Authorization Code + PKCE
             v
Product backend / BFF
  Better Auth
    - Generic OAuth client for the central realm
    - local product HttpOnly session
    - central provider tokens kept server-side
             |
             | local Better Auth session cookie
             v
Product frontend
```

For machine-to-machine calls:

```text
Product backend
  confidential service client
             |
             | OAuth client_credentials
             v
Central platform business resource
  Better Auth resource-client verification
  domain authorization and business operation
```

The product application's Better Auth session is a relying-party session, not
a competing identity source. The central realm remains authoritative through
the immutable `issuer + sub` pair.

## Non-Negotiable Invariants

- Central Better Auth session cookies never leave the auth origin.
- Central access and refresh tokens never enter browser storage for web apps.
- Product frontends receive only their product application's HttpOnly session
  cookie.
- Every OAuth access token is bound to an explicit resource/audience.
- Every protected business endpoint checks the required scope.
- Browser, native/public, confidential web, MCP, and service clients are
  separate OAuth client profiles with least-privilege grants.
- A service client cannot be used as a user and a user token cannot be used as
  a service credential.
- Better Auth tables and APIs are the only source of truth for OAuth clients,
  grants, consents, codes, and tokens.
- Temporary compatibility routes must have a named removal phase and may not
  become a second permanent integration mode.

## Current Hybrid Inventory

| Current component | Disposition | Reason |
| --- | --- | --- |
| Per-realm Better Auth instances and registry | Keep | Platform composition and realm isolation are our responsibility. |
| Better Auth OAuth Provider plugin | Keep and make canonical | It already owns authorization code, PKCE, refresh, client credentials, consent, discovery, and token endpoints. |
| Better Auth hosted login session | Keep on auth origin only | It is the authorization-server session, not a credential for product apps. |
| `apps/api/src/modules/login/store.ts` login-code store | Delete | Duplicates Better Auth authorization-code storage and consumption. |
| `/api/:realm/login/session-code` | Delete | Duplicates the OAuth authorize/continue flow. |
| `/api/:realm/login/token` | Delete | Duplicates the Better Auth OAuth token endpoint. |
| `sessionCookie` login exchange contract | Delete | Exports a central Better Auth session credential across the platform boundary. |
| JWT plugin `/token` endpoint | Disable and remove from integrations | OAuth Provider mode must use `/oauth2/token`. |
| `packages/auth-client` custom session/token implementation | Replace | Reimplements PKCE, session persistence, access-token caching, refresh, and logout. |
| `packages/auth-server` direct `jose` verifier | Replace | Better Auth provides a resource client and `verifyAccessToken` behavior. |
| Hosted login React application | Keep and simplify | UI is ours; protocol transitions must be delegated to Better Auth client plugins. |
| Manual OAuth/OIDC metadata aliases | Keep only if routing requires them | A routing adapter is acceptable; metadata content must come from Better Auth helpers. |
| Admin OAuth-client UI/API | Keep as a thin facade | It may call `auth.api.adminCreateOAuthClient` and related Better Auth APIs but must not write OAuth tables itself. |
| Billing, entitlement, profile, and storage APIs | Keep as business resources | They are platform capabilities, but their authorization must use Better Auth sessions or OAuth resource tokens at the correct boundary. |

## Phase 0: Freeze and Prove the Direction

- [x] Do not publish a successor to the current `0.1.x` SDK until the clean
  integration passes end-to-end tests.
- [ ] Do not migrate Amela to another intermediate auth contract.
- [x] Pin the exact Better Auth and OAuth Provider versions used by the
  migration; do not design against `latest` implicitly.
- [x] Add an architecture decision record stating:
  - central auth is an OAuth/OIDC authorization server;
  - product web backends are confidential relying parties/BFFs;
  - product frontends use local Better Auth sessions;
  - direct public-client OAuth is reserved for native, CLI, MCP, or explicitly
    approved browser-only applications.
- [x] Build a minimal in-repo reference product before changing Amela.
- [x] Prove with the pinned Better Auth version that Generic OAuth supports:
  - [x] discovery against the realm-specific issuer;
  - [x] Authorization Code with PKCE;
  - [x] automatic issuer validation from discovery, including rejection of a
    mismatched `iss`;
  - [x] refresh-token rotation;
  - [x] provider-token retrieval on the product backend;
  - [x] stable access to the central `sub` identity.
- [x] Decide and document how the product Better Auth user/account model exposes
  the central `issuer + sub` without treating email as an identity key.

### Phase 0 exit gate

- [x] The reference product can sign in through a real realm and establish a
  local HttpOnly Better Auth session without exposing a central session or
  token to browser JavaScript.

## Phase 1: Make Better Auth OAuth Provider Canonical

- [x] Configure the central realm with `disabledPaths: ["/token"]`.
- [x] Configure the JWT plugin for OAuth Provider mode, including disabling the
  legacy JWT response header when required by the pinned Better Auth version.
- [x] Keep the JWT plugin only as the signing/JWKS mechanism used by the OAuth
  Provider for JWT access and ID tokens.
- [ ] Define explicit OAuth resources rather than deriving a broad audience set
  from every trusted origin.
- [ ] Define explicit scopes for each resource.
- [x] Keep OIDC identity scopes separate from platform business scopes.
- [ ] Define distinct client profiles:
  - confidential product web/BFF client: `authorization_code` and
    `refresh_token`;
  - public native/browser client: `authorization_code` with mandatory PKCE and
    no client secret;
  - MCP client: dynamic/public behavior required by the MCP integration;
  - service client: `client_credentials` and no user grants.
- [ ] Provision all clients through Better Auth server APIs.
- [ ] Link clients to resources through Better Auth resource APIs when
  per-client resource enforcement is enabled.
- [ ] Add admin operations for list, create, rotate, disable/delete, and inspect
  client metadata without ever returning a stored client secret.
- [ ] Show a newly generated client secret only in the Better Auth creation or
  rotation response.
- [ ] Ensure Better Auth-generated migrations include all enabled plugin tables
  for every realm schema.
- [ ] Route discovery, JWKS, authorize, token, UserInfo, introspection,
  revocation, end-session, and registration requests to Better Auth handlers or
  official Better Auth routing helpers.

### Phase 1 exit gate

- [ ] A protocol test suite succeeds against only Better Auth OAuth endpoints:
  discovery, authorize, consent, code exchange, refresh, UserInfo, revocation,
  end-session, and client credentials.
- [ ] The legacy `/auth/token` endpoint is unreachable.

## Phase 2: Remove the Custom Login Handoff

- [x] Change `apps/login` to include the Better Auth OAuth Provider client
  plugin used by the pinned version.
- [x] Preserve hosted UI and realm display configuration, but pass Better
  Auth's signed `oauth_query` through every required login/continue/consent
  step.
- [x] Use Better Auth client methods for email sign-in, signup, social sign-in,
  passkeys, 2FA, password reset, OAuth continue, and OAuth consent.
- [x] Keep required 2FA enrollment in the Better Auth `postLogin` hook and
  signed continuation flow; optional passkey enrollment must not block OAuth
  authorization.
- [x] Configure Telegram as a standard OIDC provider in Better Auth's hosted
  social-login flow. A Mini App webview follows Telegram's authorization-code
  redirect; raw `initData` is never relayed into a platform protocol.
- [x] Remove `createLoginSessionRedirect` from
  `apps/login/src/auth-client.ts`.
- [x] Remove custom session-code and token exchange request validators.
- [x] Remove custom session-code and token exchange DTO translators.
- [x] Remove custom rate-limit rules that exist only for the deleted handoff
  routes.
- [x] Remove Redis and memory login-code stores from API startup and shutdown.
- [x] Remove the custom login-code unit and integration tests.
- [x] Add a public-HTTP integration test for signed hosted login, required TOTP
  enrollment, PKCE callback, local product session creation, refresh rotation,
  and issuer-mismatch rejection.
- [x] Replace them with Better Auth OAuth Provider integration tests through
  the public HTTP boundary.

### Files expected to be deleted or substantially reduced

- [x] Delete `apps/api/src/modules/login/store.ts`.
- [x] Remove handoff orchestration from `apps/api/src/modules/login/core.ts`.
- [x] Remove `/login/session-code` and `/login/token` from
  `apps/api/src/modules/login/http.ts`.
- [x] Remove handoff parsing from `apps/api/src/modules/login/validator.ts`.
- [x] Remove handoff response shaping from
  `apps/api/src/modules/login/translator.ts`.
- [x] Remove handoff startup wiring from `apps/api/src/http/app.ts`.
- [x] Remove handoff rate-limit matching from
  `apps/api/src/http/security.ts`.
- [x] Remove obsolete tests under `apps/api/src/modules/login/__tests__` and
  `apps/api/integration/login.integration.ts` only after equivalent Better Auth
  protocol coverage exists.

### Phase 2 exit gate

- [ ] No HTTP response, DTO, log entry, test fixture, or SDK API contains a
  Better Auth `sessionCookie` or `set-auth-token` credential for a product app.
- [x] Hosted login completes through Better Auth `/oauth2/authorize` and
  `/oauth2/token` only.

## Phase 3: Establish the Product-App Better Auth Pattern

- [x] Create a confidential OAuth client for the reference product through the
  central Better Auth admin API.
- [x] Configure the reference product's Better Auth instance with Generic OAuth
  discovery against its central realm.
- [x] Enable PKCE and the pinned version's automatic issuer validation from
  discovery. The removed legacy `requireIssuerValidation` option must not be
  recreated in platform code.
- [x] Request only `openid`, the required identity claims, `offline_access`, and
  explicitly required platform resource scopes.
- [x] Handle the OAuth callback through the product application's Better Auth
  handler.
- [x] Keep central access and refresh tokens in the product backend's Better
  Auth account storage.
- [x] Use the product application's Better Auth session cookie for browser-to-
  product API authentication.
- [x] Expose the central `issuer + sub` to product business code through one
  typed server-side helper.
- [ ] Key product data by the central subject only after realm/issuer validation;
  never join identities by email.
- [ ] Verify local session creation, refresh, logout, account linking behavior,
  and central-session expiration/revocation semantics.
- [ ] Document the approved direct-public-client pattern separately for apps
  that genuinely cannot run a BFF.

### Phase 3 exit gate

- [x] Product browser code has no access-token storage, refresh logic, PKCE
  implementation, central auth fetch wrapper, or central session token.

## Phase 4: Convert Platform Capabilities into OAuth Resources

- [x] Inventory every current platform endpoint that accepts a Better Auth
  bearer session token outside the auth origin in
  [`OAUTH_RESOURCE_INVENTORY.md`](./OAUTH_RESOURCE_INVENTORY.md).
- [x] Classify each operation as:
  - central hosted-session UI operation;
  - user-delegated platform resource operation;
  - service-only platform resource operation;
  - product-owned business operation that should leave the auth platform.
- [x] Define separate `storage:avatar:write` and
  `storage:avatar:delete` user-delegated scopes for the retained avatar API.
- [ ] Define the minimal read-only scope for the retained billing summary API.
- [ ] Define separate service-only scopes for quota consumption or other
  backend operations.
- [x] Verify avatar resource requests with the official
  `better-auth/oauth2` request verifier and a database-backed DPoP replay
  store.
- [x] Check avatar issuer, audience, expiry, and operation scope through Better
  Auth.
- [ ] Keep only domain authorization after protocol verification, such as
  validating that a service may act on a subject in its realm.
- [x] Return standards-compliant `WWW-Authenticate` resource challenges from
  the avatar resource.
- [x] Publish OAuth Protected Resource Metadata for the avatar resource.
- [ ] Ensure checkout, portal, avatar, and entitlement operations no longer
  require exporting or replaying the central Better Auth session credential.

### Phase 4 exit gate

- [ ] No product backend forwards a user's central Better Auth session token.
- [ ] No platform business endpoint treats a browser session token and OAuth
  access token as interchangeable credentials.

## Phase 5: Replace the SDK Packages

### `@nezdemkovski/auth-client`

- [x] Stop adding features to the current implementation.
- [x] Delete custom PKCE generation and callback exchange.
- [x] Delete custom central session persistence.
- [x] Delete custom JWT expiry parsing, access-token caching, and refresh.
- [x] Delete the authenticated fetch retry loop tied to `/auth/token`.
- [x] Delete Telegram logic that extracts `set-auth-token`.
- [x] Delete billing/profile methods that authenticate with a central session
  token.
- [x] Replace product browser integration with the product application's normal
  Better Auth client.
- [ ] Deprecate the published `0.1.x` package after the reference product and
  Amela no longer consume it.

Expected obsolete files:

- [x] `packages/auth-client/src/login/core.ts`
- [x] `packages/auth-client/src/session/core.ts`
- [x] `packages/auth-client/src/session/token.ts`
- [x] `packages/auth-client/src/crypto/base64.ts`
- [x] `packages/auth-client/src/crypto/core.ts`
- [x] `packages/auth-client/src/storage/core.ts`
- [x] `packages/auth-client/src/storage/memory.ts`
- [x] `packages/auth-client/src/telegram/core.ts`
- [x] the current orchestration in `packages/auth-client/src/client.ts`

### Better Auth product integration package

- [x] Create one small server-side integration package only if it removes
  repeated configuration across product apps.
- [x] The package may provide:
  - [x] validated realm issuer configuration;
  - [x] a Generic OAuth provider configuration factory;
  - [x] typed extraction of the central `issuer + sub` from the local Better Auth
    account/session;
  - [x] stable platform scope/resource constants;
  - framework-neutral hooks required for subject mapping.
- [x] The package must return Better Auth configuration and Better Auth types;
  it must not implement sessions, OAuth exchanges, token storage, or refresh.
- [x] Do not wrap ordinary Better Auth client methods merely to rename them.

### `@nezdemkovski/auth-server`

- [x] Replace direct `jose` verification with Better Auth's official resource
  client or `verifyAccessToken` API.
- [x] Require an explicit audience/resource and endpoint scopes.
- [x] Preserve only platform conventions and typed domain-claim parsing that
  Better Auth does not own.
- [x] Rename or remove the package if direct Better Auth resource-client usage
  is already simpler for product apps.

Expected obsolete files or dependencies:

- [x] `packages/auth-server/src/token/core.ts`
- [x] custom JWKS resolver configuration in
  `packages/auth-server/src/config/validator.ts`
- [x] direct `jose` dependency, if no non-Better-Auth protocol remains

### `@nezdemkovski/auth-contracts`

- [x] Remove login-code, session-cookie, and legacy access-token contracts.
- [x] Do not copy Better Auth OAuth token, session, user, or error response
  types into this package.
- [x] Infer Better Auth types from Better Auth instances where possible.
- [x] Keep only stable platform business contracts, such as entitlement or
  media DTOs, that are not Better Auth protocol models.

Expected obsolete files:

- [x] `packages/auth-contracts/src/login/contract.ts`
- [x] login/session fixtures in
  `packages/auth-contracts/src/__tests__/contracts.test.ts`

### Phase 5 exit gate

- [ ] No published package owns a parallel authentication state machine.
- [x] The smallest supported product integration is recognizably Better Auth
  configuration, not a proprietary auth client.

## Phase 6: Migrate Amela as the First Real Consumer

- [ ] Complete Phases 0-5 against the reference product first.
- [ ] Provision separate Amela web/BFF and service clients.
- [ ] Add Better Auth to the Amela backend as a Generic OAuth relying party.
- [ ] Store the local Better Auth session in an HttpOnly cookie.
- [ ] Map Amela business users to the central realm `issuer + sub`.
- [ ] Remove central auth access/session tokens from Amela browser state,
  request headers, and WebSocket query parameters.
- [ ] Replace custom frontend auth bootstrap with the local Better Auth client.
- [ ] Move billing consumption to the service client with a service-only scope.
- [ ] Verify email/password, social login, Telegram OIDC from the Mini App
  webview, passkey, 2FA,
  refresh, logout, billing checkout, usage consumption, and WebSocket auth.
- [ ] Add rollback instructions that revert the deployment, not the protocol
  invariants.

### Phase 6 exit gate

- [ ] Amela contains no compatibility code for `/login/token`,
  `/login/session-code`, `/auth/token`, central session relay, or custom JWT
  refresh.

## Phase 7: Delete Compatibility and Publish

- [ ] Remove all compatibility routes immediately after the last consumer has
  migrated and production verification succeeds.
- [ ] Remove the Redis login-code namespace and any operational dashboards or
  alerts that exist only for it.
- [ ] Remove legacy CORS allowances and rate-limit rules.
- [ ] Remove unused JWT/session contracts and dependencies from the lockfile.
- [ ] Rewrite `README.md` so the primary integration is OIDC federation through
  Better Auth, not the custom login handoff.
- [ ] Rewrite `docs/SDK.md` around Better Auth configuration and platform
  business clients.
- [ ] Update `TODO.md` and remove completed items that celebrate the deleted
  custom login-code implementation.
- [ ] Mark the old npm SDK versions as deprecated with a migration message.
- [ ] Publish replacement packages only after full typecheck, unit, integration,
  browser, and reference-product suites pass.
- [ ] Deploy auth first, migrate consumers second, remove compatibility third,
  then verify live discovery, login, refresh, logout, and billing paths.

## Required Test Matrix

- [ ] Realm isolation: a client, code, token, session, subject, or resource from
  one realm is rejected by another.
- [ ] Authorization Code + PKCE happy path through hosted login.
- [ ] State mismatch, issuer mismatch, redirect mismatch, reused code, invalid
  verifier, and expired code failures.
- [ ] Consent accept, consent deny, repeated consent, and scope reduction.
- [ ] Access-token expiry and refresh-token rotation.
- [ ] Logout and token revocation behavior across central and product sessions.
- [ ] User token with wrong audience or missing scope.
- [ ] Service token with wrong audience, scope, client, or realm.
- [ ] User token rejected by service-only endpoints.
- [ ] Service token rejected by user-delegated endpoints.
- [ ] Telegram OIDC, email/password, social, passkey, 2FA, verification, and
  reset flows continue through Better Auth.
- [ ] Multi-replica production topology without process-local protocol state.
- [ ] No credentials, tokens, cookies, or authorization codes appear in logs,
  audit payloads, URLs, frontend storage, or error responses.

## Mechanical Removal Checks

Before declaring the migration complete, all of these searches should return no
runtime integration hits outside historical migration documentation:

```bash
rg 'login/token|login/session-code' apps packages
rg 'sessionCookie|set-auth-token' apps packages
rg 'realmPath\("/auth/token"\)' packages apps
rg 'LoginCodeStore|RedisLoginCodeStore|MemoryLoginCodeStore' apps packages
rg 'createRemoteJWKSet|jwtVerify' packages/auth-server apps/api/src/modules
```

Additional checks:

- [x] Central Better Auth config includes the legacy `/token` disablement.
- [ ] Every resource verifier receives an explicit audience and scopes.
- [ ] No product browser bundle contains a central client secret.
- [ ] No web product stores central access or refresh tokens in local storage,
  session storage, IndexedDB, AsyncStorage, or a JavaScript-readable cookie.

## Definition of Done

- [ ] Better Auth is the only implementation of authentication sessions,
  authorization codes, PKCE validation, OAuth token issuance, token refresh,
  revocation, introspection, discovery, and OAuth client persistence.
- [ ] The auth platform contains custom policy and business resources, but no
  parallel authentication protocol.
- [ ] Product web apps use Better Auth as relying parties and expose only local
  HttpOnly sessions to their browsers.
- [ ] Machine integrations use Better Auth-issued, audience-bound,
  scope-limited client-credentials tokens.
- [ ] Published packages are thin Better Auth configuration or platform
  business adapters and contain no custom auth state machine.
- [ ] Amela passes the clean integration test matrix with all compatibility code
  removed.

## Official Better Auth References

- [OAuth 2.1 Provider](https://better-auth.com/docs/plugins/oauth-provider)
- [JWT plugin and OAuth Provider mode](https://better-auth.com/docs/plugins/jwt)
- [Generic OAuth client](https://better-auth.com/docs/plugins/generic-oauth)
- [Better Auth client](https://better-auth.com/docs/concepts/client)
- [Telegram OIDC login](https://core.telegram.org/bots/telegram-login)
