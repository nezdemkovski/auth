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

Write tests as behavior specifications, not implementation checks:

- Prefer public HTTP routes, public service methods, validators, or translators over private helpers.
- Add one meaningful test at a time, then implement or refactor only enough to make that behavior pass.
- Do not write shape-only translator tests that just mirror object fields without protecting a real invariant.
- Do not mock internal collaborators when a small fake at the public boundary is enough.
- Do not use real project, product, user, or company names in tests. Use neutral fixtures such as `demo`, `Demo App`, `demo.example.com`, and `user@example.com`.
- Every security-sensitive fix must include a regression test for the failure mode.
- Critical flows should have at least one integration-style test through the HTTP boundary when the route can be exercised without real external services.

## Naming

Use noun-based layer names:

- `validator.ts`, not `validate.ts`
- `translator.ts`, not `translate.ts`
- `store.ts`, not `repository.ts` unless the codebase adopts repository naming everywhere

Avoid duplicated names inside a domain folder. Prefer `modules/billing/core.ts` over `modules/billing/billing.service.ts`.

## Domain Enums

Use exported TypeScript enums for closed domain values: providers, feature modes, product types, entitlement types, storage folders, upload purposes, page modes, and similar state.

- Define shared domain enums in the closest stable owner, usually `apps/api/src/config/*` for cross-module settings or the owning module for local concepts.
- Do not create new string-union types for closed values when an enum is practical.
- Do not compare against raw string literals for domain state; compare against enum members.
- Raw strings are fine for user content, URLs, HTTP paths, SQL literals, external protocol constants, and error codes unless that value is a closed domain set used in multiple places.

## TypeScript Types

Avoid type assertions and casts. If TypeScript cannot prove a value is safe, add a narrow typed boundary instead:

- Prefer type guards, structural input types, typed constants, or small parser functions.
- Do not use `as`, `as unknown as`, `as never`, angle-bracket assertions, or assertion-style workarounds in tests.
- Avoid `satisfies` as a workaround for weak modeling; use it only when it materially checks a literal shape without changing the inferred value.
- Do not add explicit return types to obvious local functions where TypeScript infers the type cleanly. Keep explicit return types for exported API contracts, async store/service boundaries, type guards, recursive functions, overload-sensitive code, and public DTO declarations.

## Function Style

Prefer arrow functions for standalone backend functions:

- Use `const name = (...) => {}` for module-level helpers and exported standalone operations.
- Use `export const name = (...) => {}` instead of `export function name(...)` for new standalone functions.
- Keep class methods as methods.
- Keep `function` declarations for type guards (`value is Type`) and other cases where TypeScript syntax or narrowing is clearer with `function`.
- Do not rely on hoisting for new code. If order matters, move the helper above its first top-level use.

## Duplication

Do not copy-paste helper functions across files.

- If the same helper appears a second time, stop and extract it to the closest sensible owner.
- Prefer a pure helper in the domain module over duplicating request-specific wrappers in multiple HTTP files.
- Keep shared helpers small and named by the invariant they enforce, not by the first caller that needed them.
- Do not create broad utility folders for one-off helpers; use the nearest domain owner first.

## Migration Rule

When moving existing code into modules, migrate one domain at a time and keep each move behavior-preserving. Run `bun run typecheck` and `bun run test` after every meaningful slice.
