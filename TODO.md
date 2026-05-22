# TODO

## Application Readiness

- Add structured request logging without leaking credentials, tokens, cookies, or
  PII.
- Add a minimal read-only diagnostics endpoint for configured projects and auth
  health.
- Add integration tests that exercise signup, signin, session lookup, and project
  isolation against Postgres.
- Add a small example client showing how a product app should integrate with the
  project-scoped auth endpoint.
- Enforce realm 2FA policies (`admins` / `everyone`) for users that have not
  enrolled an authenticator yet.

## Security

- Review secure cookie behavior behind Cloudflare Tunnel and Kubernetes service
  proxies.
- Add audit events for sensitive auth actions.
- Define a backup and restore procedure before accepting real users.
- Require password confirmation and email verification before changing the admin
  account email.

## Done

- Project-scoped auth state: each project has its own schema, cookie prefix, and
  trusted origins.
- Domain roles and product-specific profiles stay outside this service.
- Auth-owned data only: users, sessions, providers, verification, reset, and
  auth security events.
- Email verification and password reset delivery through Cloudflare Email.
- React Email templates and local preview server.
- Basic security headers for all responses.
- Rate limiting for signin, signup, hosted login, hosted token exchange,
  password reset, and verification flows.
- Optional Bun-native Redis-backed rate limiter through `REDIS_URL`, with
  in-memory fallback for local development.
- Database-backed realm registry managed through the admin UI.
- Redis-backed hosted auth code store for multi-replica deployments.
