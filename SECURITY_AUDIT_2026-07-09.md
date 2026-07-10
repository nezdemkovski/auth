# Auth Platform Security and Reliability Audit

Date: 2026-07-09
Baseline: `master` at `f46df28`
Scope: API, hosted login, admin UI, billing, storage, database lifecycle, CI, Docker, Helm, and operator documentation.

## Verification baseline

- Fresh API typecheck: passed.
- Fresh API unit tests: 123 passed, 0 failed before remediation.
- Helm lint and render: passed before remediation.
- Production dependency audit before remediation: 12 advisories (8 moderate, 4 low); the OAuth audience advisory was directly reachable by the current configuration.
- Production dependency audit after remediation: no vulnerabilities found.
- Tracked-file secret-prefix scan: no matches. Git history and external secret stores were not scanned.

## Finding tracker

Status values: `open`, `test-added`, `fixed`, `mitigated`, `decision-required`, `verified`.

| ID | Severity | Finding | Evidence | Status |
| --- | --- | --- | --- | --- |
| SEC-01 | Critical | OAuth resource indicators permit a client to obtain a token for another configured audience on Better Auth 1.6.23. | `apps/api/src/auth/project-auth.ts`, GHSA-p2fr-6hmx-4528 | verified |
| SEC-02 | Critical | Hosted login stores and returns the complete browser `Cookie` header instead of only the current realm credential. | `apps/api/src/modules/login/core.ts` | verified |
| SEC-03 | Critical | Public SVG uploads can execute script on the auth origin when bundled storage is routed through `/storage`. | `apps/api/src/modules/storage/media.ts`, `charts/auth/templates/router-configmap.yaml` | verified |
| SEC-04 | High | Required 2FA is decided in the hosted UI flow but is not enforced when issuing a session code or using direct auth routes. | `apps/api/src/modules/login/core.ts`, `apps/api/src/modules/auth-proxy/http.ts` | verified |
| SEC-05 | Medium | The generated bootstrap credential is intentionally shown once; privileged API access must remain blocked until mandatory rotation succeeds. | `apps/api/src/db/bootstrap.ts`, `apps/api/src/http/admin/session.ts` | verified |
| SEC-06 | High | Realm auth routes miss the application rate limiter; proxy-derived client IP is not restricted end to end. | `apps/api/src/http/security.ts`, `charts/auth/templates/network-policy.yaml` | verified |
| SEC-07 | High | Custom cookie-authenticated billing and storage mutations rely on CORS but do not validate `Origin`/CSRF. | `apps/api/src/http/project-csrf.ts` | verified |
| SEC-08 | High | Password-reset and OAuth credentials can be included in default browser telemetry URL context. | `apps/login/src/config-loader.tsx`, `packages/client-shared/src/observability.ts` | verified |
| SEC-09 | Medium | Login-code exchange accepts PKCE verifiers that violate the required length and character set. | `apps/api/src/modules/login/core.ts` | verified |
| SEC-10 | Critical | Realm schema names are not byte-length bounded; PostgreSQL truncation can map distinct slugs to one physical schema. | `apps/api/src/config/projects.ts` | verified |
| SEC-11 | Medium | Serving processes use a database owner across every realm; `search_path` is a namespace, not an authorization boundary. | `apps/api/src/db/project-db.ts`, `charts/auth/templates/api-deployment.yaml` | decision-required |
| COR-01 | Critical | Concurrent creation of one slug can make the losing request drop the winning realm schema. | `apps/api/src/modules/projects/core.ts` | verified |
| COR-02 | High | An insufficient reservation can commit deductions made from earlier grants before returning `allowed: false`. | `apps/api/src/modules/billing/usage-store.ts` | verified |
| COR-03 | High | Billing webhooks project state before durable deduplication and do not reject stale event ordering. | `apps/api/src/modules/billing/webhooks.ts` | verified |
| COR-04 | High | Recurring grants do not reset and removed automatic entitlements remain active. | `apps/api/src/modules/billing/usage-store.ts` | verified |
| COR-05 | High | Usage consumption has no client idempotency key, so retries can debit twice. | `apps/api/src/modules/billing/usage-http.ts`, `apps/api/src/modules/billing/usage-store.ts` | verified |
| COR-06 | High | Registry updates rebuild realms from partial snapshots and close old pools while requests may still hold them. | `apps/api/src/auth/registry.ts` | verified |
| COR-07 | Medium | Media compensation leaves stale metadata; successful replacements retain old public objects. | `apps/api/src/modules/storage/core.ts` | verified |
| COR-08 | High | Startup migration advisory locks are not held on one session and do not cover all realm migrations. | `apps/api/src/db/bootstrap.ts`, `apps/api/src/db/migrate.ts` | verified |
| PERF-01 | Medium | Free grants are reconciled with writes on summary/reserve/consume hot paths, sometimes repeatedly per request. | `apps/api/src/modules/billing/usage-store.ts` | verified |
| OPS-01 | High | CI and production install different lockfiles; 26 resolved package records differ. | `bun.lock`, `apps/api/Dockerfile` | verified |
| OPS-02 | High | Serving replicas run schema mutations automatically and no tested backup/restore workflow exists. | `apps/api/src/db/migrate.ts`, `charts/auth/templates/api-migration-job.yaml`, `docs/OPERATIONS.md` | mitigated |
| OPS-03 | High | ExternalSecret refreshes do not restart consumers; credential rotations can leave workloads inconsistent. | `charts/auth/templates/*-deployment.yaml`, `docs/OPERATIONS.md` | verified |
| OPS-04 | Medium | Readiness is static, liveness and readiness share one endpoint, and the integration storage healthcheck always succeeds. | `apps/api/src/http/app.ts`, `dev/docker-compose.integration.yml` | verified |
| OPS-05 | Medium | Helm workloads retain unnecessary privilege/filesystem/network access and the chart has no NetworkPolicy. | `charts/auth/templates/network-policy.yaml`, `charts/auth/templates/*-deployment.yaml` | verified |
| OPS-06 | Medium | Actions, base images, and deployable image references are mutable rather than digest/commit pinned. | `.github/workflows/*.yml`, `apps/*/Dockerfile`, `charts/auth/values.yaml` | verified |
| TEST-01 | High | Hosted login and admin have no frontend/browser regression suite for critical auth journeys. | `tests/browser/auth-flows.spec.ts` | verified |
| UI-01 | Medium | Admin session expiry does not centrally clear the protected shell and cached realm data. | `apps/admin/src/admin/AdminApp.tsx`, `apps/admin/src/admin/api/shared.ts` | verified |
| UI-02 | Medium | Rejected network/JSON operations can leave hosted auth flows blank or silently failed. | `apps/login/src/config-loader.tsx`, `apps/login/src/hooks/useLoginFlowActions.ts` | verified |
| UI-03 | Low | Admin mutation state is not scoped to the active realm during navigation. | `apps/admin/src/admin/routes/ProjectRoute.tsx` | verified |
| PRIV-01 | Medium | Complete Polar webhook payloads containing billing PII are duplicated without an explicit retention policy. | `apps/api/src/modules/billing/webhooks.ts`, `apps/api/src/modules/billing/webhook-store.ts` | verified |
| AUTH-01 | Medium | Email verification is sent but not required before a session is issued; enumeration behavior is not documented as policy. | `apps/api/src/auth/project-auth.ts`, `apps/api/src/email/templates.tsx` | verified |
| DOC-01 | Low | Environment, route, dependency, database, and recovery documentation has drifted from the implementation. | `.env.example`, `README.md`, `docs/OPERATIONS.md` | verified |
| LIVE-01 | Medium | The public realm JWKS alias forwards the wrong path to Better Auth and returns 404. | `apps/api/src/modules/auth-proxy/http.ts`, `auth.integration.ts` | verified |
| LIVE-02 | Medium | Better Auth rejects the multi-hop forwarded IP chain and collapses clients into one shared rate-limit bucket. | `apps/api/src/config/proxy.ts`, `apps/api/src/http/security.ts`, `charts/auth/templates/router-configmap.yaml` | verified |

## Remediation rules

1. Add a regression test that demonstrates each deterministic application defect before or together with its fix.
2. Use render/static assertions for Helm, Docker, CI, and documentation controls that cannot be reproduced as unit failures.
3. Do not silently choose product policy for `SEC-11`, `PRIV-01`, or `AUTH-01`; record and enforce the selected policy.
4. Keep Drizzle pinned to `1.0.0-rc.4` unless a separate migration is explicitly approved.
5. Mark a finding `verified` only after focused tests and the full repository verification pass succeed.

## Remaining external validation

- Full Git-history and container-image secret scan.
- Live Kubernetes NetworkPolicy and ExternalSecret rotation exercises.
- PostgreSQL plus object-storage backup and restore drill.
- Independent penetration test after remediation.

## Remediation evidence

- Auth boundaries: `project-auth.test.ts`, `policy.test.ts`, `auth-proxy/http.test.ts`,
  `login/core.test.ts`, `project-csrf.test.ts`, `project-session.test.ts`, and
  `session.test.ts`.
- Data correctness: 42 Postgres/Redis/S3 integration tests cover bootstrap output, concurrent realm
  creation, quota rollback/idempotency/reset, cross-replica webhook serialization and deduplication,
  replacement storage cleanup, email verification, PKCE, JWKS aliases, users, and settings.
- Browser behavior: 3 Playwright tests cover URL credential scrubbing, forced
  bootstrap password rotation, and centralized 401 session invalidation.
- Operations: `repository-controls.test.ts` renders the chart and asserts the
  migration job, probes, NetworkPolicy, pod hardening, immutable pins, one
  lockfile, and dependency health checks.
- Final verification: 151 API unit tests, frontend package tests, 5 repository
  controls, 42 integration tests, 3 browser tests, full Turbo build, Helm lint
  with and without object storage, Caddy validation, all four Docker builds,
  non-root/read-only container smoke tests, router-owned client IP overwrite
  verification, and a clean production dependency audit.

## Architecture second pass

- Project session authorization is owned by one HTTP boundary and reused by billing and storage;
  admin authorization applies the same realm 2FA policy in addition to role and bootstrap-password
  rotation checks.
- Auth proxy policy uses realm-relative paths, keeps only enrollment/recovery 2FA routes reachable
  before enrollment, and blocks disabling 2FA when the realm requires it.
- Polar webhook persistence stores an explicit audit allowlist instead of recursively blacklisting
  PII fields. Processing is serialized with a PostgreSQL advisory lock per realm resource, including
  across API replicas, while unrelated resources remain parallel.
- Storage replacement cleanup is outside the successful upload transaction. Failed cleanup remains
  durably marked for bounded retry, and read-only object listing no longer triggers deletion work.
- PostgreSQL conflict handling uses SQLSTATE `23505`, and internal lifecycle states use domain enums
  instead of repeated raw literals.
