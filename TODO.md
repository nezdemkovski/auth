# TODO

## Now

- Execute the behavior-preserving modular monorepo migration in
  [`docs/MODULAR_MONOREPO_MIGRATION.md`](docs/MODULAR_MONOREPO_MIGRATION.md):
  extract stable backend capabilities into isolated workspace packages, keep
  app-only presentation and composition as feature modules, and enforce a
  domain-acyclic dependency graph.
- Extend the existing Postgres/Redis/S3 and browser suites with real passkey,
  2FA enrollment, email-delivery, and Polar checkout sandbox scenarios.
- Track Better Auth's server-admin OAuth client lifecycle API. Replace the
  isolated `auth-oauth-client-management` plugin when upstream exposes
  ownerless list/get/update, secret rotation, disable, and delete operations;
  keep the admin API contract unchanged during that swap.
- Finish the `@nezdemkovski/auth` rollout from
  [`docs/AUTH_SDK_DESIGN.md`](docs/AUTH_SDK_DESIGN.md): add end-to-end PKCE,
  refresh rotation, browser and Expo callback tests; publish the single package;
  migrate Amela frontend and backend; then verify web, Telegram Mini App
  bootstrap, native, WebSocket, billing, storage, and MCP behavior before
  removing compatibility endpoints.
- Finish the realm-scoped Telegram Mini App rollout from
  [`docs/TELEGRAM_MINI_APP_AUTH.md`](docs/TELEGRAM_MINI_APP_AUTH.md): connect
  Amela, verify signed `initData` bootstrap on real iOS and Android clients,
  then remove the temporary Telegram OIDC code and hosted Telegram button.
- Expand structured request logging to cover request/response metadata without
  leaking credentials, tokens, cookies, or PII.
- Expand audit events to cover successful email verification/reset flows. Failed
  sensitive auth requests, admin settings, password changes, session
  termination, social provider, storage, delivery, and billing mutations already
  emit structured audit logs.
- Add a minimal read-only diagnostics endpoint for configured projects, Redis,
  database connectivity, delivery provider status, and billing provider status.

## Billing and Entitlements

- Add a broader entitlement view for boolean and lifetime benefits alongside
  the existing audience-bound usage summary and atomic quota operations.
- Add an OpenMarkers integration example for the current 50 AI requests product:
  checkout button, checkout return handling, and request consumption.
- Keep auth-owned usage limited to generic quota accounting; detailed business
  events remain in the product that understands them.

## Security and Operations

- Audit follow-up checklist:
  - [x] Use real direct client IPs for rate-limit keys when proxy headers are
    not trusted.
  - [x] Use atomic Redis `INCR` + `EXPIRE` for rate limiting.
  - [x] Replace admin DB pool-per-operation with a shared long-lived admin pool.
  - [x] Quote `search_path` values in libpq options.
  - [x] Clean up project schema/settings when realm creation fails midway.
  - [x] Rebuild `AuthRegistry` with an atomic swap when delivery settings
    change.
  - [x] Derive Better Auth session secrets per realm.
  - [x] Split session signing secret from encrypted settings key with
    `SECRET_ENCRYPTION_KEY`.
  - [x] Validate storage endpoints even when storage is disabled.
  - [x] Require HTTPS for user-configured storage endpoints while allowing
    deployment-managed internal endpoints.
  - [x] Reject oversized uploads before calling `formData()`.
  - [x] Disable unauthenticated OAuth dynamic client registration.
  - [x] Remove the public `/api/projects` realm enumeration endpoint.
  - [x] Run typecheck and tests in the image publish workflow before building
    images.
  - [x] Add test/typecheck gating to the Helm chart publish workflow, or document
    why image CI is the canonical code gate.
  - [x] Move storage response shaping out of the store and remove identity
    translator placeholders.
  - [x] Move project creation/patch validation and feature normalization out of
    the project store.
  - [x] Keep billing JSON parsing local to the billing store instead of importing
    it from the translator.
  - [x] Move delivery runtime config mapping from core to translator/runtime
    boundary.
  - [x] Stop importing HTTP `AdminSession` types into core modules.
  - [x] Replace raw `"admin"` realm comparisons with shared constants.
  - [x] Move settings-table DDL out of hot read/update paths.
  - [x] Standardize HTTP error envelopes across modules.
  - [x] Validate resend-verification email format and length.
  - [x] Port `secret-crypto.ts` from `node:crypto` to WebCrypto/Bun-native crypto.
  - [x] Add structured logging and audit events for sensitive actions.
  - [x] Add integration tests with real Postgres, Redis, and S3-compatible
    storage.
- Add S3-compatible object storage for media and future user files:
  - evaluate RustFS as the first homelab backend while keeping the auth service
    coupled only to the S3 API.
  - use one public bucket with realm-prefixed keys, for example
    `realms/{realmSlug}/images/{random}.webp` for realm images and
    `realms/{realmSlug}/images/{userId}/{random}.webp` for user images.
  - use `realms/{realmSlug}/files/...` before storing generic non-image files,
    and add a separate private bucket/prefix before storing non-public user
    files.
  - store object metadata in Postgres, not blobs: object key, mime type, size,
    checksum, owner, realm, and timestamps.
  - make backend build object keys from trusted realm/user/project context; the
    frontend must never submit arbitrary object paths.
  - validate upload size and mime type, randomize object keys, and clean up old
    images after replacement.
  - expose files through a stable public URL such as `files.nezdemkovski.cloud`
    instead of leaking the internal S3 endpoint.
- Review secure cookie behavior behind Cloudflare Tunnel and Kubernetes service
  proxies after the split frontend/API deployment settles.
- Perform and record the first quarterly backup/restore drill using
  `docs/OPERATIONS.md`.
- Add key rotation support for encrypted settings if this becomes more than a
  personal homelab service.
- Rename database tables away from the temporary `auth_` prefix once the final
  product/service name is decided. Prefer neutral names in the dedicated auth DB
  and realm schemas, for example `projects`, `billing_settings`,
  `storage_settings`, and `storage_objects`, instead of baking the current
  working name into long-lived schema names.

## UX Polish

- Keep improving admin billing UX after testing real Polar products:
  fewer required fields, clearer product/benefit mapping, and better validation
  messages.
- Add empty/error/loading states for every admin settings panel.

## Done

- Replaced protocol-first realm onboarding with a three-field golden path.
  Realm creation now provisions the primary Better Auth product client and
  returns a one-time copy-ready environment block; OAuth profiles, scopes,
  resources, callback paths, and MCP discovery stay internal. Existing realms
  expose one primary app setup while rare service credentials remain collapsed
  under Backend API keys.
- Added Better Auth's official CIMD plugin for zero-registration MCP client
  discovery while keeping unauthenticated Dynamic Client Registration disabled.

- Realm-owned OAuth client management extracted into the private compiled
  `@nezdemkovski/auth-oauth-client-management` package. Product web, public/MCP,
  and service profiles support admin-only create/list/get/update, resource
  links, secret rotation, disable/enable, and delete without a realm user owner;
  persistence stays behind Better Auth's adapter models and secrets are returned
  only at creation or rotation.
- OAuth protected-resource audiences, scopes, user/service token policy,
  metadata, request authorization, and challenge responses extracted into
  private compiled `@nezdemkovski/auth-oauth-resource`; the per-realm runtime
  exposes only narrow official Better Auth resource-client and verifier ports,
  including DPoP replay protection.
- Better Auth-owned user and session administration, initial-admin bootstrap
  state, identity validation, and response translation extracted into private
  compiled `@nezdemkovski/auth-identity`; realm composition and HTTP stay in
  the API, and the package does not mint sessions or replace Better Auth's user
  model.
- Per-realm Better Auth construction, lifecycle registry, auth policy,
  project database setup, OAuth metadata, and DPoP verification
  extracted into private compiled `@nezdemkovski/auth-better-auth-runtime`;
  delivery and billing enter only through app-owned composition functions.
- Realm metadata, feature policy, social-provider configuration, validation,
  and persistence extracted into private compiled `@nezdemkovski/auth-realm`;
  the app-level runtime catalog composes billing and storage explicitly, while
  the admin project translator combines only realm and identity read models.
- Billing and entitlements extracted into private compiled
  `@nezdemkovski/auth-billing`: Polar settings and webhooks, product mapping,
  grants, quota usage and reservations live behind explicit ports without
  importing Better Auth, identity, realm, or storage internals.
- Storage capability extraction into private compiled
  `@nezdemkovski/auth-storage`, with explicit persistence/provider ports and an
  API-owned media use case for realm icons and user avatars.
- Shared crypto primitives extracted into private compiled
  `@nezdemkovski/auth-platform-crypto` instead of duplicating hash/random
  helpers across backend packages.
- Turborepo workspace split:
  `apps/api`, `apps/admin`, `apps/login`, `packages/client-shared`, and
  `packages/ui`.
- Local compose dev stack with router, API, admin Vite, login Vite, Postgres,
  and Redis.
- Production chart split into API, admin frontend, login frontend, router,
  Postgres, and Redis dependencies.
- Router mount points for `/admin`, `/admin/*`, `/login`, `/login/*`, `/api/*`,
  `/admin/api/*`, and `/healthz`.
- Project-scoped auth state: each realm has its own schema, cookie prefix, and
  trusted origins.
- Database-backed realm registry managed through the admin UI.
- Admin UI for creating realms and editing realm metadata, origins, auth
  features, social providers, delivery settings, and billing settings.
- Auth-owned data boundary: users, sessions, providers, verification, reset, and
  auth security state stay in auth; product profiles and business data stay in
  product apps.
- Email verification and password reset flows in the hosted login UI.
- Delivery settings stored encrypted in the database and configurable through
  the admin UI.
- Resend and Cloudflare Email delivery providers.
- React Email templates and preview script.
- Passkey, 2FA, Agent Auth, OAuth provider, social login providers, and last
  login method support behind realm-level settings.
- Hosted OAuth consent page with approve/deny flow.
- Password reset UI and backend.
- Admin email change requires current password and Better Auth email-change
  verification.
- Basic security headers for all frontend and router responses.
- CSRF origin checks for admin state-changing requests.
- OAuth Provider tokens include the realm project and `email_verified` claims.
- Rate limiting for sign-in, sign-up, password reset, and verification flows.
- Redis-backed rate limiter through `REDIS_URL`, with in-memory fallback for
  local development.
- Hosted OAuth login delegates authorization codes, PKCE, sessions, and token
  lifecycle to Better Auth without a platform login-code store.
- Reference product demonstrates the product resource-server boundary using
  `@nezdemkovski/auth/server` without a second auth system.
- Avatar storage and billing usage are explicit Better Auth OAuth resources
  with Protected Resource Metadata, audience-bound access tokens, and
  least-privilege scopes.
- Billing quota mutations use Better Auth `client_credentials` and reject both
  central session cookies and user-delegated OAuth tokens.
- A single `@nezdemkovski/auth` package exposes isolated `/client`, `/server`,
  `/billing`, and `/storage` entry points; the previous public packages were
  unpublished and removed from the workspace.
- Polar billing provider support:
  encrypted provider settings, connection verification, product listing,
  product creation, product/price/benefit mapping, and Better Auth Polar plugin
  wiring.
- Temporary mock `preview-server.ts` removed.
