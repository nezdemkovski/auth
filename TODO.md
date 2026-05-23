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

## Billing and Entitlements

- Add realm-level Stripe billing settings in the admin UI:
  - enabled flag, test/live mode, secret key, webhook secret, readonly webhook
    URL, and connection verification.
- Add realm-level product and price mapping:
  - products with name, description, active state, and optional Stripe product ID.
  - prices with Stripe price ID, type (`subscription`, `one_time`,
    `credit_pack`, `lifetime`, `metered`), billing interval, linked product, and
    active state.
- Add entitlement mapping for each price:
  - keys such as `ai_requests`, `pro_access`, `export_pdf`, and `team_seats`.
  - grant types for boolean access, recurring quota, one-time credits, lifetime
    access, and metered usage.
  - amount, reset period, expiry policy, and spend priority.
- Use Better Auth Stripe plugin for subscriptions:
  - customer creation on signup.
  - subscription plans loaded from realm billing settings.
  - billing portal and subscription lifecycle webhooks.
- Add custom Stripe Checkout + webhook handling for non-subscription purchases:
  - credit packs.
  - lifetime purchases.
  - other one-time products.
- Expose an entitlement API for product apps:
  - check current entitlements.
  - consume quota or credits atomically.
  - avoid exposing Stripe price IDs to apps like OpenMarkers.
- Keep app usage in each product app:
  - OpenMarkers should track AI request usage/business events locally.
  - auth should own identity, billing state, and generic entitlements.

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
- Rate limiting for signin, signup, login, login token exchange,
  password reset, and verification flows.
- Optional Bun-native Redis-backed rate limiter through `REDIS_URL`, with
  in-memory fallback for local development.
- Database-backed realm registry managed through the admin UI.
- Redis-backed login auth code store for multi-replica deployments.
