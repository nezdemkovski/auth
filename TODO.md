# TODO

## Application Readiness

- Decide whether project configuration should stay in `AUTH_PROJECTS` or move to
  a database-backed registry.
- Add a project onboarding command that validates trusted origins and updates
  `AUTH_PROJECTS` safely.
- Replace the in-memory auth rate limiter with a durable limiter before running
  multiple replicas.
- Add structured request logging without leaking credentials, tokens, cookies, or
  PII.
- Add a minimal read-only diagnostics endpoint for configured projects and auth
  health.
- Add integration tests that exercise signup, signin, session lookup, and project
  isolation against Postgres.
- Add a small example client showing how a product app should integrate with the
  project-scoped auth endpoint.

## Security

- Review secure cookie behavior behind Cloudflare Tunnel and Kubernetes service
  proxies.
- Add audit events for sensitive auth actions.
- Define a backup and restore procedure before accepting real users.

## Done

- Project-scoped auth state: each project has its own schema, cookie prefix, and
  trusted origins.
- Domain roles and product-specific profiles stay outside this service.
- Auth-owned data only: users, sessions, providers, verification, reset, and
  auth security events.
- Email verification and password reset delivery through Cloudflare Email.
- React Email templates and local preview server.
- Basic security headers for all responses.
- In-memory rate limiting for signin, signup, hosted login, hosted token
  exchange, password reset, and verification flows.
