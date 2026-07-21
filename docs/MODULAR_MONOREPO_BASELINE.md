# Modular Monorepo Baseline

Recorded on 2026-07-13 before the first package extraction.

This file is a historical snapshot, not the current workspace inventory. The
old `auth-contracts` and `auth-integration` public-package target was later
superseded by the single `@nezdemkovski/auth` package in
[`AUTH_SDK_DESIGN.md`](AUTH_SDK_DESIGN.md).

## Current Workspace Graph

Turborepo discovers eight workspaces:

| Package | Path | Classification | Workspace dependencies |
| --- | --- | --- | --- |
| `@nezdemkovski/auth-api` | `apps/api` | private app/composition | `auth-contracts`; `auth-reference-product` for integration tests |
| `@nezdemkovski/auth-admin` | `apps/admin` | private frontend app | `auth-client-shared`, `auth-ui` |
| `@nezdemkovski/auth-login` | `apps/login` | private frontend app | `auth-client-shared`, `auth-ui` |
| `@nezdemkovski/auth-reference-product` | `apps/reference-product` | private executable example | `auth-integration` |
| `@nezdemkovski/auth-client-shared` | `packages/client-shared` | private frontend foundation | none |
| `@nezdemkovski/auth-ui` | `packages/ui` | private frontend foundation | `auth-client-shared` |
| `@nezdemkovski/auth-contracts` | `packages/auth-contracts` | public npm package | none |
| `@nezdemkovski/auth-integration` | `packages/auth-integration` | public npm package | none; Better Auth is a peer |

The workspace graph is acyclic. The API remains one large workspace, so Turbo
cannot yet isolate changes to billing, storage, delivery, observability, realm,
or Better Auth runtime code.

## Current Module Couplings

| Current edge | Classification | Migration decision |
| --- | --- | --- |
| `projects -> billing/store` | domain leak | app-level realm aggregate query composes both |
| `projects -> storage/settings-store` | domain leak | app-level realm aggregate query composes both |
| `projects -> users/store` | domain leak | inject identity statistics/query port |
| `storage -> projects/store` | cross-domain use case | app-level media core coordinates realm icon update |
| `storage -> users/store` | cross-domain use case | app-level media core coordinates avatar update |
| `auth/registry -> billing/*` | platform-to-domain leak | inject optional Better Auth plugin/webhook contributions |
| `billing-usage/http -> oauth-resource/http` | HTTP implementation leak | inject resource authorizer at route registration |
| `storage/public-http -> oauth-resource/http` | HTTP implementation leak | inject resource authorizer at route registration |
| `login/http -> observability/core` | concrete adapter leak | depend on a minimal reporter port |
| `db/bootstrap -> every domain store` | valid composition in the wrong folder | move to explicit API migration composition |
| `http/admin/context -> every service` | service locator pressure | give routes only the capability they require |

These are temporary migration edges. They are not approved package dependency
directions.

## Target Packages Accepted at the Time

| Package group | Responsibility | Visibility |
| --- | --- | --- |
| `foundation/platform-core` | stable realm/subject identifiers, typed errors, minimal shared ports | private |
| `foundation/platform-database` | shared pool/connection types, no domain tables | private |
| `domains/realm` | realm identity and base metadata | private |
| `domains/identity` | administration around Better Auth-owned users/sessions | private |
| `domains/admin-account` | platform administrator account use cases | private |
| `domains/billing` | Polar, products, entitlements, usage, reservations, webhooks | private |
| `domains/storage` | settings, object policy, S3 adapter, object metadata | private |
| `domains/delivery` | settings, provider adapters, senders, templates | private |
| `domains/observability` | settings and reporting adapters | private |
| `platform/better-auth-runtime` | per-realm Better Auth construction, policy, registry | private |
| `platform/oauth-resource` | Better Auth resource verification and metadata | private |
| `frontend/ui` | domain-agnostic visual primitives | private |
| `frontend/client-shared` | browser theme and observability plumbing | private |
| `public/auth-contracts` | stable business DTOs only | public npm |
| `public/auth-integration` | thin Better Auth product composition | public npm |

Frontend admin/login capabilities remain app-local feature modules unless a
second consumer creates a real reuse or build boundary.

## Allowed Dependency Matrix

| From | May depend on workspace tags |
| --- | --- |
| `app` | `app`, `domain`, `foundation`, `platform`, `public`, `frontend` |
| `domain` | `foundation`, `public` |
| `platform` | `foundation`, `public` |
| `foundation` | `foundation`, `public` |
| `frontend` | `frontend`, `public` |
| `public` | `public` |

In particular, `domain -> domain` is forbidden. Cross-domain workflows are
application composition, not a sibling package dependency.

## Passing Baseline

Before boundary enforcement and package extraction:

- `bun run typecheck`: 13 Turbo tasks succeeded across 8 workspaces.
- `bun run test`: all workspace tests succeeded, including 150 API unit tests
  and 5 repository-control tests.
- `bun run build`: all 8 workspace builds succeeded.
- `bun run test:integration`: 42 Docker-backed integration tests succeeded with
  236 expectations against Postgres, Redis, and S3-compatible storage.

The existing admin and login Vite configuration depended on hoisted root build
dependencies. `turbo boundaries` exposed six undeclared imports; the first
boundary slice moves those dependencies to the apps that use them.

## Migration Progress

The first behavior-preserving extraction adds two private compiled packages:

- `@nezdemkovski/auth-platform-database` owns the shared admin database pool
  boundary and authenticated secret encryption. It contains no domain tables or
  queries.
- `@nezdemkovski/auth-observability` owns observability settings, validation,
  persistence, response translation, and the Sentry reporter. Its only
  workspace dependency is `auth-platform-database`.

Observability HTTP routing remains in `apps/api`. Login now depends on a local
minimal public-config port rather than the concrete observability service.

The next leaf extraction adds `@nezdemkovski/auth-delivery`, which owns provider
configuration, encrypted settings, Cloudflare and Resend adapters, React Email
templates, and Better Auth email-handler construction. The API supplies one
runtime-update callback, so delivery does not import the Better Auth registry.
