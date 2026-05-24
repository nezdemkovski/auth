# API Refactor Plan

This plan focuses on simplifying the current backend modules after the first
domain-based split. The target is not another file shuffle. Each step should
make handlers thinner, move orchestration into core services, keep persistence
inside stores, and make important behavior easier to test.

## Target Shape

Every domain should follow this rule:

- `http.ts`: route registration, auth, request parsing, status mapping only.
- `core.ts`: business operations, registry updates, SDK calls, side effects.
- `store.ts`: database reads/writes only.
- `validator.ts`: raw input parsing and simple normalization.
- `translator.ts`: response DTOs and secret-safe public shapes.
- `__tests__`: validator, translator, and core tests close to the module.

Do not create placeholder files. Add a layer only when it has real work.

## Priority 1: Shared Admin Routing Helpers

Current problem:

- Every admin module repeats the same pattern:
  authenticate admin, lookup project, block system project, parse JSON, map
  common errors.
- `AdminRouteContext` contains service instances and mutable delivery state,
  which makes route modules depend on too much global state.
- `http/admin/shared.ts` mixes Better Auth API wrappers, route context types,
  media error mapping, CSRF helpers, and formatting helpers.

Plan:

- Add small helpers for:
  - `requireAdminSession(c, options)`.
  - `requireRegisteredProject(c, options)`.
  - `requireMutableProject(c, options)`.
  - `parseJson(c)`.
  - typed domain error to JSON response mapping.
- Split `http/admin/shared.ts` into focused files, for example:
  - `http/admin/context.ts`
  - `http/admin/auth.ts`
  - `http/admin/security.ts`
  - `http/admin/responses.ts`
- Keep `createAdminApi` as the composition root, but move `/me`, `/profile`,
  and `/change-password` into `modules/admin-account/http.ts`.

Done when:

- Admin routes no longer manually repeat auth/project lookup boilerplate.
- `modules/*/http.ts` files read mostly as route maps.
- `http/admin.ts` only creates services, installs middleware, and registers
  modules.

Progress:

- `requireRegisteredProject` and `requireMutableProject` are shared.
- `/me`, `/profile`, and `/change-password` live in `admin-account`.
- `http/admin/shared.ts` is split into focused helper files and re-exported
  for compatibility.
- Remaining work: shared `parseJson` and common domain-error response helpers.

## Priority 2: Projects Module

Current problem:

- `modules/projects/http.ts` still owns business logic:
  project creation, schema preparation, existence checks, registry refresh,
  billing/social-provider reloads, social verification, and response shaping.
- `modules/projects/store.ts` mixes several responsibilities:
  table migrations, default project construction, validation, feature
  normalization, row mapping, and DB writes.
- Social provider persistence lives in `social-provider-store.ts`, but social
  provider verification is still in `http.ts`.

Plan:

- Add `modules/projects/core.ts` with `ProjectService`.
- Move these operations into `ProjectService`:
  - list projects with user/session counts.
  - create project idempotently enough to keep failure boundaries explicit.
  - update project settings and refresh registry with billing/social/storage.
  - read/update/verify social providers.
- Move feature/default construction into a small domain helper:
  - either `defaults.ts` or keep in `store.ts` only if it remains storage-facing.
- Move social provider response shaping into `translator.ts`.
- Keep `store.ts` focused on:
  - `ensureProjectSettingsTable`
  - `seedAdminProjectSettings`
  - `readProjectSettings`
  - `createProjectSettings`
  - `updateProjectSettings`
  - `updateProjectIconUrl`
- Consider renaming `social-provider-store.ts` to `social-providers.ts` only if
  it remains a sub-domain, or split later into:
  - `social-provider-store.ts`
  - `social-provider-core.ts`
  - `social-provider-translator.ts`

Tests to add:

- `ProjectService.createProject` blocks admin/system slug and duplicates.
- `ProjectService.updateProject` refreshes registry with social/billing data.
- Social provider verify refuses disabled/incomplete providers.
- Translators never expose `clientSecret`.

Done when:

- `projects/http.ts` does no DB or Better Auth API work directly.
- Project lifecycle behavior can be tested without Hono.

Progress:

- `ProjectService` owns project listing, creation, updates, social provider
  updates, social verification, registry refresh, and response orchestration.
- Remaining work: reduce `projects/store.ts` helper sprawl and add service
  tests around duplicate/system project boundaries.

## Priority 3: Billing Module

Current problem:

- `billing/store.ts` is large and contains validation, normalization,
  encryption, row mapping, public DTO shaping, and SQL.
- `billing/core.ts` depends directly on Polar SDK construction and parses Polar
  errors inline.
- `billing/validator.ts` uses broad casts after shape checks, so bad enum values
  are accepted until store validation throws.
- Product creation currently invents default entitlements in
  `translator.ts`, which mixes UI/default business policy with DTO mapping.

Plan:

- Split SDK integration into `polar-client.ts`:
  - create client
  - verify token
  - list products
  - create product
  - normalize Polar errors
- Move entitlement defaults out of `translator.ts` into `core.ts` or
  `entitlements.ts`.
- Split store internals:
  - `store.ts` for exported persistence API.
  - local helper functions can stay private, but validation should move out.
- Make `validator.ts` reject invalid provider/environment/product/grant enums
  early instead of casting.
- Add `translator.ts` functions for all public billing settings responses so
  store does not shape API DTOs.

Tests to add:

- validator rejects invalid product types, grant types, reset periods, and
  currencies.
- store secret preservation when tokens are omitted.
- core maps Polar 401/422 style errors into stable domain errors.
- default entitlements are explicit and test-covered.

Done when:

- Store returns domain settings, not public DTOs.
- Polar SDK can be mocked at one boundary.

Progress:

- Billing patch validation now lives in `validator.ts`.
- Product JSON normalization now lives in `translator.ts`.
- Polar SDK integration lives in `polar-client.ts`.
- Default product entitlements live in `entitlements.ts`.
- Billing settings parser rejects invalid provider/environment/product/grant
  enum values before they reach core/store.
- Store now returns internal billing settings state; public settings DTOs live in
  `translator.ts`.
- Polar error mapping has focused tests.
- Remaining work: add focused tests for secret preservation.

## Priority 4: Storage Module

Current problem:

- `storage/store.ts` contains two domains in one file:
  storage settings and storage object metadata.
- `storage/core.ts` updates user images with raw SQL instead of going through a
  store function.
- Upload side effects are only partially transactional:
  object upload, metadata insert, project/user update can diverge on failure.
- `media.ts` likely has object-key and file validation policy that should be
  clearly separated from upload transport.

Plan:

- Split store into:
  - `settings-store.ts`
  - `objects-store.ts`
  - keep `store.ts` as a barrel only if imports stay simpler.
- Move `updateUserImage` into `users/store.ts`.
- Add an explicit upload workflow in `core.ts`:
  - validate storage is configured.
  - upload object.
  - insert metadata.
  - update project/user image.
  - define cleanup behavior if DB update fails after upload succeeds.
- Add `translator.ts` for public storage settings and object explorer DTOs.
- Decide whether object metadata is per-project DB or admin DB; document the
  choice. Current implementation stores metadata in each project DB.

Tests to add:

- object metadata preserves `originalFileName`.
- project icon upload updates registry and response DTO.
- user avatar upload writes user image through users store.
- managed storage hides credentials and requires only enabled flag.

Done when:

- `storage/store.ts` no longer exceeds one persistence concern.
- Upload behavior has clear failure semantics.

Progress:

- Storage settings and object metadata are split into `settings-store.ts` and
  `objects-store.ts`.
- User avatar image updates now go through `users/store.ts`.
- Remaining work: add storage translators and define cleanup behavior for
  upload workflows when later DB updates fail.

## Priority 5: Login Module

Current problem:

- `login/http.ts` is not Hono-specific, but it still mixes config DTO building,
  response helpers, feature exposure, and flow endpoints.
- `LoginFlowService` internally calls `registered.auth.handler` using synthetic
  requests. That is pragmatic, but it should be isolated and documented.
- `validator.ts` always returns strings, even for invalid bodies, so core owns
  more invalid input handling than needed.
- `store.ts` imports `ReconnectingRedisClient` from `http/security`, creating an
  odd dependency from a module store to HTTP security code.

Plan:

- Move shared Redis client out of `http/security.ts` into infra, for example:
  `infra/redis.ts`.
- Add login `translator.ts` for:
  - login config.
  - reset password config.
  - OAuth consent config.
- Make validator return `null` for malformed login/token bodies and have
  `http.ts` return `invalid_body`.
- Extract Better Auth session-code issuing into a small adapter:
  `better-auth-session.ts` or a private class inside `core.ts`.
- Document the synthetic internal request boundary in code, because this is a
  security-sensitive path.

Tests to add:

- invalid token/session-code bodies return `invalid_body`.
- login config hides disabled providers.
- code exchange is single-use and validates PKCE before delete.
- Redis store and memory store behavior share the same contract tests.

Done when:

- `login/http.ts` only maps URL/query/body to service calls and responses.
- Redis dependency is not imported from `http/security`.

Progress:

- Shared Redis reconnect wrapper lives in `db/redis.ts`; login store and rate
  limiter both depend on it.
- Login config/reset/consent DTOs now live in `translator.ts`.
- Malformed login/token request bodies now return `invalid_body`.
- Remaining work: isolate/document synthetic Better Auth session requests.

## Priority 6: Delivery Module

Current problem:

- `delivery/store.ts` shapes both runtime `EmailConfig` and public settings DTOs.
- Validation is split between `validator.ts` and private store validation.
- Provider-specific behavior is embedded in conditionals across store/core.

Plan:

- Add `translator.ts` for public delivery settings.
- Make store read/write a single internal `DeliverySettings` domain type.
- Move provider validation into `validator.ts` or a small domain helper.
- Add provider-specific helpers:
  - `toRuntimeEmailConfig(settings)`.
  - `isDeliveryConfigured(settings)`.
- Keep `DeliveryService` responsible for refreshing runtime sender and sending
  verification email.

Tests to add:

- Resend and Cloudflare settings preserve existing secrets when omitted.
- provider `none` disables runtime sender cleanly.
- verify throws `delivery_not_configured` when incomplete.

Done when:

- Store does not return public DTOs.
- Runtime config conversion is a named, tested function.

Progress:

- Public delivery settings response shaping now lives in `translator.ts`.
- Delivery patch validation now lives in `validator.ts`.
- Delivery store now returns an internal `DeliverySettings` domain type.
- Runtime `EmailConfig` conversion is a named `toRuntimeEmailConfig` helper and
  has focused tests.
- Remaining work: add focused tests for secret preservation and verify failure
  modes.

## Priority 7: Users Module

Current problem:

- `users/http.ts` shapes project and user responses inline.
- `resend-verification` calls Better Auth API directly from HTTP.
- Project counts live in users store but are consumed by projects module.

Plan:

- Add `users/core.ts` for:
  - list users.
  - terminate sessions.
  - resend verification email.
- Add `users/translator.ts` for user/project DTOs.
- Decide where `readProjectCounts` belongs:
  - keep in users if counts are strictly user/session counts.
  - or move to `projects/store.ts` if counts are part of project listing.
- Make resend verification validate that the email belongs to the target realm
  before sending, unless Better Auth already enforces this clearly.

Tests to add:

- user DTO date serialization.
- terminate sessions returns count.
- resend verification refuses disabled delivery.

Done when:

- `users/http.ts` has no Better Auth API calls and no DTO construction.

Progress:

- `UsersService` owns list, terminate sessions, and resend verification.
- `users/translator.ts` owns project/user DTO shaping.
- Remaining work: add focused tests for DTO date serialization and resend
  verification failure modes.

## Priority 8: Admin Account Module

Current problem:

- `/me`, `/profile`, and `/change-password` still live in `http/admin.ts`.
- `admin-account/store.ts` updates `"user"` with three branches for optional
  fields.
- Email-change behavior spans `http/admin.ts`, Better Auth wrappers, delivery
  settings, and store updates.

Plan:

- Add `modules/admin-account/http.ts` and register it from `createAdminApi`.
- Add `modules/admin-account/core.ts` for:
  - read current admin profile.
  - update profile.
  - request email change.
  - change password and clear bootstrap flag.
- Keep Better Auth API wrappers either in this core or in an auth adapter.
- Simplify `updateAdminProfile` to build the update shape once, or split into
  `updateAdminName` and `updateAdminEmail` if email remains special.

Tests to add:

- email change requires delivery and current password.
- password change enforces minimum length and clears bootstrap flag.
- duplicate email maps to `email_in_use`.

Done when:

- `http/admin.ts` no longer contains admin-account routes.

Progress:

- Done. Admin account routes and core behavior live in `modules/admin-account`.

## Priority 9: Cross-Cutting Store Infrastructure

Current problem:

- Every admin-store creates and closes a new `pg.Pool` per operation.
- `createAdminPool` is duplicated in multiple stores.
- Search path strings are duplicated.

Plan:

- Introduce a small DB infra helper:
  - `db/admin-pool.ts` or `infra/postgres.ts`.
  - `withAdminDb(options, fn)` helper.
  - central `search_path` formatting.
- Later, consider long-lived admin pool injection if request volume matters.
  For now a helper still reduces duplication without changing lifecycle.

Tests to add:

- search path helper escapes or rejects invalid schema names.
- each store uses the shared helper.

Done when:

- No module defines its own `createAdminPool`.

Progress:

- Admin stores now use shared `db/admin-pool.ts`.
- Remaining work: add tests around search path formatting or schema
  validation, and consider `withAdminDb` if store boilerplate keeps growing.

## Priority 10: App-Level Routes

Current problem:

- `http/app.ts` is a large composition root plus public route handlers,
  feature gating, upload route, auth proxy route, and metadata routes.
- Project upload for user avatar sits in app-level routes while admin project
  icon upload sits in storage module.

Plan:

- Keep `createApp` as composition root, but move route groups:
  - `modules/login/http.ts` should register its own routes instead of exporting
    standalone request functions.
  - `modules/storage/public-http.ts` or `modules/storage/http.ts` should own
    public user avatar upload route too.
  - Auth proxy and well-known metadata can move to `modules/auth-proxy/http.ts`
    or `modules/auth/http.ts`.
- Move `isEnabledAuthFeaturePath` into the auth proxy module and keep tests
  beside it.

Tests to add:

- auth feature gating stays unchanged after route extraction.
- CORS trusted-origin behavior stays unchanged.

Done when:

- `http/app.ts` mostly wires middleware and route modules.

Progress:

- Login routes are registered from `modules/login/http.ts`.
- Public user avatar upload is registered from `modules/storage/public-http.ts`.
- Auth proxy, feature gating, and well-known metadata live in
  `modules/auth-proxy/http.ts`.
- Public project listing is registered from `modules/projects/public-http.ts`.
- Remaining work: add route-level regression tests for the extracted public
  CORS behavior if we want stronger coverage.

## Suggested Execution Order

1. Shared admin route helpers. Mostly done; remaining work is response/parsing
   helpers.
2. Admin account module HTTP/core extraction. Done.
3. Projects core extraction. Done for the main service flow. Store cleanup and
   social provider sub-domain cleanup remain.
4. Users core/translator extraction. Done.
5. Storage store split is done; upload workflow cleanup remains.
6. Billing validation/translation cleanup, Polar client split, entitlement split,
   and store DTO cleanup are done. Secret-preservation tests remain.
7. Delivery translator/validation cleanup and runtime config cleanup are done.
   Secret-preservation and verify failure tests remain.
8. Login Redis infra cleanup, config translators, and malformed-body handling
   are done. Synthetic Better Auth request boundary cleanup remains.
9. Shared DB helper is started; duplicate module-level `createAdminPool`
   functions are gone.
10. App-level route extraction is mostly done; `http/app.ts` now wires
    middleware and route modules.

Each step should be a separate commit and must pass:

```text
bun run typecheck
bun run test
git diff --check
```

Avoid changing behavior and structure in the same commit unless the behavior is
covered by tests in that commit.
