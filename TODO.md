# TODO

## Application Readiness

- Add a reliable schema lifecycle for project-scoped user pools.
- Add Better Auth table migrations for every configured project schema.
- Include plugin-managed tables such as JWT JWKS when generating or applying
  project schema migrations.
- Decide whether project configuration should stay in `AUTH_PROJECTS` or move to
  a database-backed registry.
- Add a safe project onboarding command that creates the schema, applies
  migrations, and validates trusted origins.
- Add email verification and password reset delivery through a real provider.
- Add rate limiting for signup, signin, password reset, and verification flows.
- Review secure cookie behavior behind Cloudflare Tunnel and Kubernetes service
  proxies.
- Add structured request logging without leaking credentials, tokens, cookies, or
  PII.
- Add a minimal read-only diagnostics endpoint for configured projects and auth
  health.
- Add integration tests that exercise signup, signin, session lookup, and project
  isolation against Postgres.
- Add a small example client showing how a product app should integrate with the
  project-scoped auth endpoint.

## Security

- Ensure the same email can register independently in different projects without
  sharing auth state.
- Keep domain roles and product-specific profiles outside this service.
- Store only auth-owned identity data here: users, sessions, providers,
  verification, reset, and auth security events.
- Add audit events for sensitive auth actions.
- Define a backup and restore procedure before accepting real users.
