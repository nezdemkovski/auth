# Agent Guidelines

## Backend Module Structure

Organize API code by domain first, then by layer. Prefer this shape for new or refactored backend code:

```text
apps/api/src/modules/<domain>/
  http.ts
  core.ts
  validator.ts
  translator.ts
  store.ts
  __tests__/
```

Only create a layer file when the domain actually needs it. Do not add empty placeholder files just to match the template.

## Layer Responsibilities

`http.ts` is the HTTP boundary.

- Register Hono routes and middleware for the domain.
- Authenticate/authorize the request.
- Parse raw request data and call `validator.ts`.
- Call `core.ts` for business operations.
- Return HTTP status codes and response bodies.
- Do not contain business logic, persistence logic, SDK orchestration, or response shaping beyond simple `{ key: value }` envelopes.

`core.ts` is the domain orchestration layer.

- Own business logic and multi-step operations.
- Coordinate stores, SDK clients, registry updates, and side effects.
- Throw typed/domain errors that `http.ts` can translate into HTTP responses.
- Do not read raw HTTP requests, return Hono responses, or manually validate untrusted request bodies.
- Do not shape public response DTOs when a `translator.ts` exists.

`validator.ts` is the input boundary.

- Convert raw `unknown` request bodies into typed input objects.
- Trim and normalize scalar fields where appropriate.
- Validate required fields, enum values, arrays, and simple formats.
- Return typed input or `null`; do not throw for normal invalid input.
- Do not call the database, SDKs, registry, email, storage, or Hono APIs.

`translator.ts` is the output/model conversion layer.

- Convert internal models, SDK objects, and database entities into public response DTOs.
- Hide secrets and internal-only fields.
- Build computed response fields such as callback URLs or default displayed benefits.
- Keep response shape decisions out of `core.ts` and `http.ts` when the mapping is non-trivial.

`store.ts` is the persistence boundary.

- Put database reads/writes here when they are domain-specific.
- Keep SQL/Drizzle calls out of `http.ts`.
- Prefer typed functions with explicit inputs over generic query helpers.
- Do not mix business decisions into store functions; return data and let `core.ts` decide.

## Tests

Place module-specific tests next to the module:

```text
apps/api/src/modules/<domain>/__tests__/*.test.ts
```

Use module tests for validators, translators, core business rules, and store behavior when it can be tested safely. Shared cross-cutting tests may stay in `apps/api/test` when they cover app-wide behavior rather than one domain.

## Naming

Use noun-based layer names:

- `validator.ts`, not `validate.ts`
- `translator.ts`, not `translate.ts`
- `store.ts`, not `repository.ts` unless the codebase adopts repository naming everywhere

Avoid duplicated names inside a domain folder. Prefer `modules/billing/core.ts` over `modules/billing/billing.service.ts`.

## Migration Rule

When moving existing code into modules, migrate one domain at a time and keep each move behavior-preserving. Run `bun run typecheck` and `bun run test` after every meaningful slice.
