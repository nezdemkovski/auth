# ADR 0001: Better Auth Owns the Authentication Protocol

- Status: Accepted for protocol ownership; product integration profile
  superseded by [ADR 0002](0002-spa-integration-profile.md)
- Date: 2026-07-13

## Context

The platform currently combines Better Auth with a second, platform-specific
login protocol. The custom path issues its own PKCE login code, transfers a
central Better Auth session credential to the product, and then uses the JWT
plugin `/token` endpoint to mint an application token.

That creates two protocol owners:

- Better Auth owns users, sessions, OAuth clients, authorization codes, PKCE,
  OAuth tokens, discovery, and JWKS;
- platform code owns another authorization code, session handoff, token cache,
  refresh behavior, and token verification contract.

The duplicated ownership is the source of the integration boilerplate and
makes the security model harder to reason about.

## Decision

Better Auth is the only owner of authentication and OAuth/OIDC protocol
machinery.

The BFF integration described below records the original decision. ADR 0002
later replaced that product profile with public OAuth clients using mandatory
PKCE and resource-server backends. The Better Auth protocol-ownership boundary
remains accepted.

The central realm is a Better Auth OAuth 2.1/OIDC provider. A product web
backend is a confidential relying party with its own Better Auth instance and
the Better Auth Generic OAuth plugin. The product browser receives only the
product application's HttpOnly Better Auth session cookie. Central provider
tokens remain in the product backend's Better Auth account storage.

The immutable cross-system identity is:

```text
central issuer + central subject (sub)
```

Email is a mutable claim and is not an identity key.

Machine-to-machine operations use Better Auth's `client_credentials` grant
with explicit resources and scopes. Resource servers verify those tokens with
Better Auth's OAuth Provider resource client.

Platform-owned code may provide:

- realm configuration and isolation;
- hosted login and consent presentation;
- Better Auth configuration factories;
- typed extraction of `issuer + sub` from Better Auth models;
- product policy and platform business resources.

Platform-owned code may not implement:

- authorization codes or PKCE validation;
- session-cookie relay between auth and product origins;
- OAuth token issuance, refresh, revocation, or introspection;
- browser access-token storage or refresh state machines;
- manual OAuth/JWT verification when the Better Auth resource client supports
  the flow.

The original browser-token prohibition above is superseded by ADR 0002. It
still forbids a platform-invented token protocol; it does not forbid a public
OAuth client driven by a maintained standards implementation.

## Version Contract

The migration is built and tested against exactly `better-auth@1.7.0-rc.1` and
`@better-auth/oauth-provider@1.7.0-rc.1` until an explicit dependency upgrade
is reviewed.

This release discovers the provider issuer and uses it for ID-token validation.
It also rejects a mismatching `iss` authorization-response parameter when that
parameter is present. It does not expose the newer documented
`requireIssuerValidation` Generic OAuth option that rejects a missing `iss`
parameter. We will not recreate that option in platform code. Before production
cutover, either the pinned Better Auth release must provide the strict option or
an integration test must demonstrate equivalent fail-closed behavior through
the official Better Auth implementation.

## Consequences

- The existing `@nezdemkovski/auth-client` state machine and login handoff must
  be removed once the Better Auth reference flow works. This removal is now
  complete in the repository.
- The original BFF requirement is superseded by ADR 0002; current products use
  the public-client SDK documented in `AUTH_SDK_DESIGN.md`.
- A thin integration package is allowed only when it returns Better Auth
  configuration and platform identity types.
- The deleted compatibility endpoints must not be restored for new consumers.
- Amela migrates only after the reference flow passes the protocol test matrix.
