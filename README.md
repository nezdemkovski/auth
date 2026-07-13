# Auth

Central Better Auth service for projects deployed in the homelab cluster.

The service is intentionally project-scoped: each project has its own user pool
and Postgres schema, so the same email can register independently in different
projects.

```text
https://auth.nezdemkovski.cloud/api/<project>/auth/*
```

JWT verification keys are exposed per project:

```text
https://auth.nezdemkovski.cloud/api/<project>/.well-known/jwks.json
```

## Stack

- Bun
- Turborepo
- Hono
- Better Auth
- Postgres
- Drizzle ORM `1.0.0-rc.4`
- optional Redis for shared auth rate limiting
- Caddy for static frontend images

## Layout

```text
apps/api                 Hono/Bun auth API
apps/admin               Vite React admin dashboard
apps/login               Vite React login experience
apps/reference-product   Executable Better Auth product integration
packages/auth-contracts  Platform business DTOs and runtime parsers
packages/auth-integration Thin product-side Better Auth configuration
packages/client-shared   Shared frontend theme and CSS
packages/platform/oauth-client-management Realm-owned OAuth client control plane
packages/ui              Shared React UI primitives
charts/auth              OCI Helm chart for the full runtime stack
```

The frontend apps build into their own `dist` directories and run as separate
web images served by Caddy. The API server does not read or serve frontend
assets.

The supported product integration is documented in [`docs/SDK.md`](docs/SDK.md).

## Local Development

```bash
cp .env.example .env
bun install
bun run dev
```

Process liveness and dependency readiness:

```bash
curl http://localhost:3000/livez
curl http://localhost:3000/readyz
```

`/healthz` is a compatibility redirect to `/readyz`. Realm metadata is not
publicly enumerable; inspect it through the authenticated admin UI/API.

Example auth session endpoint:

```bash
curl http://localhost:3000/api/demo/auth/get-session
```

### Frontends

The frontend apps are standalone static apps:

```bash
bun run dev:admin
bun run dev:login
```

They expect to be routed with the API under the same public auth origin:

```text
/admin/*                       -> admin web
/login/*                       -> login web
/api/*                         -> auth API
```

For local end-to-end testing, use a reverse proxy or compose setup that mirrors
those routes. Running Vite directly is useful for UI-only iteration, but real
auth flows should go through a single local origin.

The login frontend loads runtime realm config from the API:

```text
GET /api/<realm>/login/config/login
GET /api/<realm>/login/config/reset-password
GET /api/<realm>/login/config/oauth-consent
```

Build frontends separately:

```bash
bun run build:admin
bun run build:login
```

Full repo build/test goes through Turbo:

```bash
bun run build
bun run test
bun run test:browser
bun run test:integration:up
bun run test:integration
bun run test:integration:down
```

## Helm Chart

The repository publishes the umbrella chart to GHCR:

```text
oci://ghcr.io/nezdemkovski/charts/auth
```

The chart deploys the API, admin UI, login UI, internal Caddy router, Redis,
optional RustFS, and External Secrets wiring. Production defaults run database
migrations in a dedicated Helm hook job; serving replicas use
`AUTH_AUTO_MIGRATE=false`. NetworkPolicy is enabled by default and only the
router accepts public ingress.

Pin `api.image.digest`, `admin.image.digest`, and `login.image.digest` to the
immutable references emitted by the image publish workflow. Version tags are
protected against overwrite but digests are the deployment source of truth.

Operational procedures for first install, migrations, secret rotation, backup,
and restore are in [`docs/OPERATIONS.md`](docs/OPERATIONS.md).

## Realm Configuration

The admin realm is bootstrapped from the environment. Application realms are
managed from the admin UI, including display metadata, trusted origins, feature
flags, and social provider settings.

Each realm gets:

- its own Better Auth instance
- its own Postgres connection with `search_path` set to the project schema
- idempotent bootstrap for the project schema and Better Auth tables
- its own cookie prefix
- its own trusted origins
- its own JWT issuer and JWKS endpoint

Applications should store their own domain data in their own databases and key
the central identity by the validated `issuer + sub` pair, never by email.

## Rate Limiting

Auth-sensitive routes are rate limited by default. Without `REDIS_URL`, limits
are kept in memory and apply per process. Set `REDIS_URL` to use Bun's native
Redis client and share limits across replicas.

## Proxy Headers

By default the service does not trust client-supplied `CF-Connecting-IP` or
`X-Forwarded-*` headers for rate limiting or Better Auth IP metadata.

Set `TRUST_PROXY_HEADERS=true` only when the service is reachable exclusively
through the chart router. Caddy trusts private upstream proxies, removes
client-controlled alternate IP headers, and NetworkPolicy blocks direct API
pod ingress.

## Media Storage

Realm images and user images can use any S3-compatible backend through Bun's
S3 API. If `AUTH_STORAGE_PROVIDER=s3` is configured in the deployment, storage
is treated as deployment-managed: the admin UI only lets each realm enable or
disable uploads, while endpoint, bucket, public URL, and credentials come from
environment variables.

Without deployment-managed storage, each realm can still configure its own S3
settings from the admin UI. Uploaded object metadata is stored in the realm
database schema; blobs stay in object storage.

The local compose stack includes RustFS for development. It creates an
`auth-public` bucket and exposes public objects under
`http://127.0.0.1:9000/auth-public/...`.

## Product Login

Product applications run their own Better Auth instance and configure the
central realm as a Generic OAuth provider. The product backend starts the
authorization-code flow with PKCE, the central hosted UI preserves Better
Auth's signed OAuth query, and Better Auth completes the callback into the
product application's own HttpOnly session cookie.

The central realm session cookie stays on the auth origin. Product browser code
does not store central access tokens, refresh tokens, PKCE state, or a copied
central session credential.

## Authentication Connections and MCP

Realms can expose OAuth/OIDC endpoints for first-party apps and remote MCP
clients. OAuth clients authenticate against the same realm-local user pool as
the login flow.

The normal admin surface models two user intentions: connecting a product
backend for user sign-in, and creating a service credential for trusted
server-to-server access. The authenticated admin API exposes them under
`/admin/api/projects/<realm>/auth-connections`. It accepts a backend URL or
named service permissions; OAuth profiles, redirect paths, scopes, resources,
PKCE, and consent policy are derived on the server and are not public form
controls. Creating the first connection enables the realm's OAuth provider.

Connections belong to the realm, not to a user account. Confidential secrets
are returned only when a connection is created or its credential is rotated.
List and detail responses expose the product intent, callback, named
permissions, and lifecycle state without leaking raw protocol configuration.

Public clients and Dynamic Client Registration are advanced protocol features,
not part of ordinary product onboarding. When Dynamic Client Registration is
enabled through realm configuration, compatible OAuth clients, including MCP
clients, can register themselves and receive a client ID. Registration only
creates client metadata; users still approve access through the consent screen.

OAuth resource identifiers are not inferred from browser trusted origins. A
client may request `resource=` only after that exact Better Auth OAuth resource
has been registered and linked to the client. The current platform resources
are avatar storage and billing usage; both publish OAuth Protected Resource
Metadata and enforce audience-specific scopes. Quota mutations additionally
require a Better Auth `client_credentials` token and never accept a browser
session or user-delegated token.
