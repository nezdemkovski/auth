# Auth

Central Better Auth service for projects deployed in the homelab cluster.

The service is intentionally project-scoped: each project has its own user pool
and Postgres schema, so the same email can register independently in different
projects.

```text
https://auth.nezdemkovski.cloud/<project>/api/auth/*
```

JWT verification keys are exposed per project:

```text
https://auth.nezdemkovski.cloud/<project>/.well-known/jwks.json
```

## Stack

- Bun
- Hono
- Better Auth
- Postgres
- Drizzle ORM `1.0.0-rc.3`
- optional Redis for shared auth rate limiting

## Local Development

```bash
cp .env.example .env
bun install
bun run dev
```

Health check:

```bash
curl http://localhost:3000/healthz
```

List configured projects:

```bash
curl http://localhost:3000/projects
```

Example auth session endpoint:

```bash
curl http://localhost:3000/demo/api/auth/session
```

## Project Isolation

Projects are configured through `AUTH_PROJECTS`.

```json
[
  {
    "slug": "demo",
    "name": "Demo",
    "schema": "demo_auth",
    "trustedOrigins": ["http://localhost:5173"]
  }
]
```

Each project gets:

- its own Better Auth instance
- its own Postgres connection with `search_path` set to the project schema
- idempotent startup bootstrap for the project schema and Better Auth tables
- its own cookie prefix
- its own trusted origins
- its own JWT issuer and JWKS endpoint

Applications should store their own domain data in their own databases and only
reference the project-local Better Auth `user.id`.

## Rate Limiting

Auth-sensitive routes are rate limited by default. Without `REDIS_URL`, limits
are kept in memory and apply per process. Set `REDIS_URL` to use Bun's native
Redis client and share limits across replicas.

## Proxy Headers

By default the service does not trust client-supplied `CF-Connecting-IP` or
`X-Forwarded-*` headers for rate limiting or Better Auth IP metadata.

Set `TRUST_PROXY_HEADERS=true` only when the service is reachable exclusively
through a trusted reverse proxy, such as Cloudflare Tunnel or nginx, that strips
incoming forwarding headers from clients before adding its own.

## Hosted Auth Handoff

The hosted login flow uses a short-lived authorization code plus PKCE S256. The
client app sends `code_challenge` and `code_challenge_method=S256` to
`/<project>/login`, stores the verifier in an HttpOnly app cookie, and sends
`code_verifier` to `/<project>/hosted/token` during callback exchange.
