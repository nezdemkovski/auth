# Modular Monorepo Migration

## Goal

Turn the repository into a modular monolith whose capabilities can be changed,
tested, and built independently without turning them into separate services.

The important boundary is not the folder name. A capability boundary is real
only when:

- it has one clear owner;
- it exposes a small public API;
- its dependencies are explicit in `package.json`;
- sibling capabilities do not deep-import or query each other's internals;
- Turborepo can test and build the capability independently;
- the API and frontend apps compose capabilities without becoming their hidden
  shared implementation.

Billing, storage, delivery, observability, realm management, and identity must
remain realm-isolated. Extracting packages must never create shared users,
balances, provider credentials, or configuration across realms.

## First-Principles Rules

### Package versus module

Create a workspace package when at least one of these is true:

- the boundary needs an independently enforceable dependency graph;
- it has its own domain model, persistence, providers, and tests;
- more than one app consumes it;
- it is published or versioned independently;
- independent Turborepo caching materially helps.

Keep code as a module inside an app when it is only presentation, routing, or
composition for that app. Do not create a package merely to replace one folder
with another folder.

Expected result:

- backend capabilities become internal workspace packages;
- Hono HTTP boundaries remain domain-first modules in `apps/api`;
- admin and login frontend features become app-local feature modules unless
  they are genuinely reused;
- only intentionally public integration packages are published to npm.

### Dependency direction

Allowed dependency direction:

```text
foundation <- domain packages <- app composition
public contracts <----------- domain adapters / product apps
shared UI <------------------ frontend apps
```

Rules:

- `apps/*` may compose multiple domain packages.
- A domain package must not import another sibling domain package.
- A domain package may depend on a small foundation package and external
  libraries that it actually uses.
- Published packages must not depend on private platform implementation.
- No package may import source files from another package by relative path.
- Cross-domain orchestration belongs in an app-level `core.ts` use case or an
  explicit composition package, never in `http.ts` or a domain store.
- Synchronous collaboration uses typed ports passed from the composition root.
- Events are reserved for genuinely asynchronous side effects; do not add an
  event bus just to avoid a normal function call.

“Domains do not know each other” means they have no compile-time dependency on
one another. The composition root is allowed to know them because assembling
the product is its job.

### Ownership

Each capability owns:

- its domain enums and models;
- validation and business rules;
- its database tables and queries;
- its provider adapters;
- its tests;
- its public internal exports.

No capability may read or write another capability's tables. A shared database
connection is infrastructure, not shared data ownership.

Examples:

- Billing owns Polar mappings, webhook snapshots, entitlement grants, usage,
  reservations, and billing settings.
- Storage owns storage settings, objects, object keys, upload validation, and S3
  behavior.
- Delivery owns delivery settings, email providers, senders, and templates.
- Observability owns provider settings and reporting adapters.
- Realm owns realm identity and base metadata, not assembled billing or storage
  configuration.
- Better Auth owns users, sessions, accounts, OAuth clients, grants, and tokens.

### Protocol ownership

Modularization must not recreate auth protocol logic in a new package.

- Better Auth remains the only OAuth/OIDC/session implementation.
- The OAuth resource package may expose verification policy and Better Auth
  resource-client composition, but it must not mint, refresh, cache, or persist
  its own tokens.
- The known server-admin OAuth client lifecycle gap remains in `TODO.md`; moving
  files does not solve it and direct plugin-table access remains forbidden.

## Proposed Workspace Shape

This is a target to validate during Phase 0, not permission to move everything
in one change.

```text
apps/
  api/                         # process, Hono boundaries, composition, migrations
    src/
      composition/
      modules/<use-case>/
        http.ts
        core.ts
        validator.ts
        translator.ts
      index.ts
  admin/                       # admin SPA composition
    src/features/<capability>/
  login/                       # hosted Better Auth UI composition
    src/features/<flow>/
  reference-product/           # executable integration example

packages/
  foundation/
    platform-core/             # only stable IDs, errors, small shared ports
    platform-database/         # connection/pool types, no domain tables
  domains/
    realm/
    identity/
    admin-account/
    billing/
    storage/
    delivery/
    observability/
  platform/
    better-auth-runtime/       # per-realm Better Auth construction and registry
    oauth-resource/            # Better Auth resource verification and metadata
  frontend/
    ui/
    client-shared/
  public/
    auth-contracts/
    auth-integration/
```

Workspace globs must be explicit, for example `packages/domains/*`; do not use
an ambiguous `packages/**` wildcard.

All new internal packages are `private: true`. Moving the existing published
packages must not change their npm names, versioning, exports, or release tags.

## Package Anatomy

Backend domain packages keep the existing domain-first layer vocabulary:

```text
packages/domains/<domain>/
  package.json
  tsconfig.json
  src/
    core.ts
    validator.ts
    translator.ts
    store.ts
    tables.ts
    ports.ts
    __tests__/
```

Only create files the domain actually needs. HTTP remains in
`apps/api/src/modules/<domain>/http.ts` because Hono is an application boundary.

Package API rules:

- export only deliberate entrypoints through `package.json#exports`;
- do not expose tables, raw database rows, provider SDK objects, or internal
  helpers unless another layer has a valid ownership reason;
- do not use a giant catch-all barrel that accidentally makes internals public;
- declare every internal dependency with `workspace:*`;
- install external dependencies in the package that imports them;
- use compiled packages for backend domains and published packages so builds
  are cacheable;
- JIT TypeScript is acceptable for Vite-only React packages;
- each package owns `build`, `typecheck`, and `test` scripts when applicable.

## Known Couplings to Remove

- [x] Stop `projects` from importing billing and storage stores to assemble an
  effective project. Move aggregation to the API composition/application layer.
- [x] Stop storage from importing project and user stores when replacing icons
  or avatars. Let an app-level media use case coordinate storage with realm or
  identity ports.
- [x] Stop `AuthRegistry` and Better Auth construction from importing Polar
  webhook and entitlement store types. Inject optional auth/plugin
  contributions from the composition root.
- [x] Stop billing and storage HTTP modules from importing another domain's HTTP
  implementation for OAuth authorization. Inject a common resource-authorizer
  port at route registration.
- [x] Stop login HTTP code from importing the concrete observability service.
  Depend on a minimal reporter port.
- [ ] Split `config/projects.ts` so billing, storage, observability, auth feature,
  and realm enums are owned by their closest stable package.
- [ ] Stop database bootstrap from knowing domain table details. Each domain
  exports one migration/bootstrap entrypoint and the app composes them.
- [ ] Remove shared admin HTTP context types that enumerate every service when a
  route only needs one capability.
- [ ] Replace cross-domain DTO shaping with an explicit app-level aggregate
  translator where a response intentionally combines capabilities.

## Phase 0: Freeze Behavior and Map Boundaries

- [x] Record the current workspace dependency graph.
- [x] Record module-to-module imports and classify each one as:
  composition, valid foundation dependency, domain leak, or temporary migration
  edge.
- [x] Decide the final package list using the package-versus-module rule above.
- [x] Mark each package as internal/private or public/published.
- [x] Define the allowed package dependency matrix before moving code.
- [x] Capture the current passing baseline:
  `bun run typecheck`, `bun run test`, `bun run build`, and the Docker-backed
  integration suite.

### Phase 0 exit gate

- [x] Every proposed package has a written responsibility and at least one real
  reason to exist.
- [x] The target dependency graph is acyclic.
- [x] No migration slice requires changing public behavior.

## Phase 1: Add Enforced Monorepo Boundaries

- [x] Add explicit nested workspace globs if the grouped package layout is
  accepted.
- [x] Add Turborepo tags for `app`, `domain`, `foundation`, `platform`, `public`,
  and `frontend` packages.
- [x] Configure `turbo boundaries` to reject undeclared dependencies, deep
  cross-package imports, and forbidden tag directions.
- [x] Keep a repository-control test for the most important rules while Turbo
  boundaries remains experimental.
- [x] Add package-local `build`, `typecheck`, and `test` tasks.
- [x] Keep root task scripts as `turbo run ...` delegates and keep repository
  checks explicitly repo-wide.
- [x] Ensure `build.dependsOn` includes `^build` and compiled outputs include
  `dist/**`.
- [ ] Add an affected-packages CI path with `turbo run ... --affected` only after
  the full suite remains the canonical security gate.

### Phase 1 exit gate

- [x] A deliberately forbidden domain-to-frontend dependency fails locally;
  the same `bun run test` boundary gate runs in image and SDK CI.
- [x] A package can be typechecked and tested with `--filter` in isolation.
- [x] Docker pruning includes only the API package's declared workspace graph;
  the production install omits dev-only dependencies.

## Phase 2: Extract Foundation Without Creating a Junk Drawer

- [x] Defer `platform-core` until stable IDs, typed errors, or ports have a real
  second package consumer; do not create an empty shared package.
- [x] Move database pool/connection types to platform database without moving
  any domain table or query there.
- [x] Keep crypto, logging, and generic parsing app-local unless at least two
  packages need the same invariant.
- [ ] Split closed domain enums out of the current project configuration and
  move them to their owning packages.
- [x] Prevent `platform-core` from becoming a `shared` package for unrelated
  helpers.

### Phase 2 exit gate

- [x] Foundation packages contain no billing, storage, delivery, observability,
  Better Auth, Hono, Polar, or S3 policy.
- [x] Domain packages depend only on foundation and their own external
  libraries.

## Phase 3: Extract Leaf Capabilities

Migrate one domain at a time and keep every move behavior-preserving.

- [x] Extract observability settings and reporter adapters.
- [x] Extract delivery settings, provider adapters, senders, and templates.
- [x] Review the admin-account boundary and defer package extraction until the
  identity/Better Auth table boundary moves in Phase 6. Extracting only its core
  now would create a fake package while persistence still writes Better Auth
  user tables in the app.
- [x] Leave each extracted domain's Hono registration in its API module and
  inject the extracted core/store interfaces.
- [x] Move observability unit tests with the owning package and retain
  integration coverage at the API boundary.
- [x] Run typecheck and tests after each domain extraction.

### Phase 3 exit gate

- [x] Each extracted package builds and tests independently.
- [x] No extracted package imports `apps/*` or a sibling domain.
- [x] Existing HTTP contracts and realm isolation tests are unchanged.

## Phase 4: Extract Storage

- [x] Move storage models, validation, object-key policy, settings, object
  persistence, and S3 adapter into the storage package.
- [x] Define explicit storage ports for object persistence and provider access.
- [x] Create an app-level media use case that coordinates storage output with
  identity avatar or realm icon updates.
- [x] Keep OAuth resource authorization in the API boundary; storage receives
  an already-authorized actor and realm.
- [x] Ensure storage cannot query identity or realm tables directly.
- [x] Preserve upload size, MIME, ownership, realm-prefix, replacement cleanup,
  and disabled-storage security tests.

### Phase 4 exit gate

- [x] Storage can be tested with fake ports and no Better Auth registry.
- [x] Cross-realm object access remains impossible through the HTTP integration
  suite.

## Phase 5: Extract Billing and Entitlements

- [x] Merge the current `billing` and `billing-usage` implementation ownership
  into one billing package with separate internal use cases.
- [x] Move Polar settings, product mapping, webhook processing, snapshots,
  entitlement grants, usage, reservations, and billing tables together.
- [x] Keep realm-local subject IDs opaque; billing must not import Better Auth
  user stores.
- [x] Replace the current subject-existence query with an identity port supplied
  by the API composition root.
- [x] Provide optional Better Auth/Polar plugin contributions through an
  explicit adapter entrypoint rather than importing billing from the auth
  registry.
- [x] Keep user-delegated reads and service-authorized mutations in API modules
  backed by the common OAuth resource authorizer.
- [x] Preserve idempotency, reservation expiry, webhook ordering, scope,
  audience, subject, and cross-realm regression tests.

### Phase 5 exit gate

- [x] Billing has no compile-time dependency on identity, storage, realm, or the
  Better Auth runtime package.
- [x] The composition root is the only place that connects billing webhooks or
  plugin contributions to per-realm Better Auth construction.

## Phase 6: Extract Realm, Identity, and Better Auth Runtime

- [ ] Extract realm metadata and realm settings ownership from the current
  project module.
- [ ] Keep aggregate admin responses in an app-level query that explicitly
  combines realm, billing, storage, delivery, and observability state.
- [ ] Extract identity administration around Better Auth-owned user/session
  data without copying Better Auth models into a parallel domain model.
- [ ] Extract per-realm Better Auth construction, policy, registry, Telegram
  OIDC configuration, and plugin composition into the Better Auth runtime
  package.
- [ ] Pass delivery, observability, billing, and storage contributions as ports
  or composition inputs; the runtime package must not import those domains.
- [ ] Extract OAuth protected-resource verification and metadata into the
  platform OAuth resource package.
- [ ] Keep login, auth proxy, and consent Hono routes as API composition over
  official Better Auth handlers.

### Phase 6 exit gate

- [ ] Better Auth runtime knows protocol and realm policy but no business
  capability implementation.
- [ ] Realm knows base configuration but does not load sibling domain stores.
- [ ] No central Better Auth cookie or custom token state machine reappears.

## Phase 7: Reorganize Frontend Features

- [ ] Move admin code to `features/realm`, `features/identity`,
  `features/billing`, `features/storage`, `features/delivery`, and
  `features/observability`.
- [ ] Give each admin feature its API client, query keys, screens, validation,
  and tests.
- [ ] Keep router, shell, session bootstrap, and cross-feature navigation in the
  admin app composition layer.
- [ ] Move login flows to feature modules for credentials, recovery, passkeys,
  2FA, OAuth consent, and realm theme/config.
- [ ] Do not extract frontend feature packages unless another app consumes them
  or an enforceable build boundary pays for the extra package.
- [ ] Keep generic visual primitives in `auth-ui`; do not move domain behavior
  into the UI package.

### Phase 7 exit gate

- [ ] A billing UI change does not require importing storage or realm screen
  internals.
- [ ] Shared UI remains domain-agnostic.

## Phase 8: Public Packages and Release Boundaries

- [ ] Keep `@nezdemkovski/auth-integration` limited to Better Auth composition,
  immutable identity extraction, and resource conventions.
- [ ] Keep business DTOs in explicit `@nezdemkovski/auth-contracts` subpath
  exports such as `/billing` and `/storage`; avoid one accidental root export
  surface.
- [ ] Decide whether any capability needs its own public client package based on
  independent versioning, not internal folder structure.
- [ ] Ensure private domain packages cannot be published accidentally.
- [ ] Update publish workflows only after package moves preserve existing npm
  names and immutable tag rules.
- [ ] Migrate Amela only against the final public package boundaries, never
  against private monorepo packages.

## Final Exit Gate

- [ ] `apps/api` contains process startup, composition, migrations, and Hono
  boundaries rather than hidden domain implementations.
- [ ] Every domain package has one responsibility, explicit exports, local
  dependencies, local tests, and owned persistence.
- [ ] No domain package imports another domain package.
- [ ] No domain reads or writes another domain's tables.
- [ ] The workspace dependency graph is acyclic and enforced in CI.
- [ ] `turbo run build`, `turbo run typecheck`, and `turbo run test` operate on
  the declared package graph and cache independently.
- [ ] A billing-only change invalidates billing and its consumers, not unrelated
  storage or delivery package tasks.
- [ ] Full API, integration, and browser behavior remains unchanged.
- [ ] Realm isolation and all security-sensitive regression tests still pass.

## Non-Goals

- Do not split the modular monolith into network microservices.
- Do not give every package a separate database or deployment.
- Do not publish every internal package to npm.
- Do not invent a generic event bus, dependency injection framework, or service
  locator.
- Do not perform a flag-day directory rewrite.
- Do not change API contracts, OAuth behavior, or realm semantics merely to make
  extraction easier.
- Do not use temporary cross-package deep imports; keep each migration slice
  complete and behavior-preserving.
