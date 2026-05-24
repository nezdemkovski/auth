# Bun Native Backend Audit

This file tracks where the API should use Bun-native runtime features instead of
Node compatibility or custom wrappers.

## Already Good

- HTTP serving uses `Bun.serve`.
- Tests use `bun test`.
- Redis uses Bun's native `RedisClient`.
- Object storage uses Bun's native `S3Client`.
- Upload parsing uses web-native `File` and `FormData`.
- Runtime request handling uses web-native `Request`, `Response`, `Headers`,
  and `URL`.

## Changed

- `runtime/crypto.ts` now wraps Bun-native crypto helpers:
  - `Bun.CryptoHasher` for SHA-256 hex/base64url hashing.
  - `crypto.getRandomValues` for random URL-safe and hex tokens.
- Login PKCE hashing, login auth codes, storage object keys/checksums, and
  bootstrap temporary passwords use these helpers instead of `node:crypto`.

## Keep For Now

- `db/secret-crypto.ts` still uses `node:crypto` for AES-GCM and HKDF.
  Bun/WebCrypto can do this, but `crypto.subtle` is async. Changing it would
  ripple through store read/write APIs, so it should be a dedicated migration
  with tests around decrypting existing values.
- Redis reconnect handling stays as a wrapper around Bun `RedisClient`.
  The wrapper exists because closed connections were observed at runtime; Bun
  gives the client, but not the policy we need.

## Candidate Spikes

### Postgres: `pg` to `Bun.sql`

`drizzle-orm/bun-sql` is available in this repo, and `Bun.sql` exists in the
runtime. A migration could remove `pg` and use Bun-native Postgres.

This is not a mechanical one-line change:

- Better Auth currently receives a `pg.Pool` as its database.
- `ProjectDatabase` exposes `projectDb.pool`, and many stores accept `Pool`.
- Bootstrap and project migration flows create `Pool` instances directly.
- We need to confirm Better Auth accepts the Bun SQL Drizzle database or Bun SQL
  client for all plugin/migration paths.

Recommended approach:

1. Create a small spike branch.
2. Replace `ProjectDatabase` with a Bun SQL backed database object.
3. Prove Better Auth auth runtime and `getMigrations` both work.
4. Convert stores away from `Pool`-typed parameters.
5. Remove `pg` only after local compose boot + tests pass.

### Response Helpers

Most admin routes use Hono `c.json`, which is fine on Bun. The remaining manual
`Response.json` calls are small error helpers. Do not replace them just to make
the code look uniform unless we also introduce the common admin domain-error
mapper from `API_REFACTOR_PLAN.md`.
