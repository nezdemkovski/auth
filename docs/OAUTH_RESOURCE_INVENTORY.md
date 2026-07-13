# OAuth Resource Inventory

This inventory defines which authentication boundary owns each platform
operation. A Better Auth authorization-server session is valid only for the
central auth origin. Cross-product platform calls use Better Auth OAuth access
tokens with an explicit resource audience and least-privilege scope.

| Boundary | Classification | Credential | Decision |
| --- | --- | --- | --- |
| `/login/:realm` and `/api/:realm/login/*` | Central hosted-session UI | Realm Better Auth session cookie | Keep on the auth origin. |
| `/api/:realm/auth/*` OAuth/OIDC, account, and session routes | Better Auth protocol boundary | Credential defined by the Better Auth route | Keep delegated to Better Auth. |
| Better Auth Polar checkout and customer portal routes | Central hosted-session UI | Realm Better Auth session cookie | Keep on the auth origin; do not proxy the cookie through a product backend. |
| `/admin/api/*` | Central control plane | Admin-realm Better Auth session cookie | Keep same-origin and separate from product resource tokens. |
| `POST /api/:realm/upload` | User-delegated platform resource | OAuth token for the exact upload resource with `storage:avatar:write` | Converted. |
| `DELETE /api/:realm/upload` | User-delegated platform resource | OAuth token for the exact upload resource with `storage:avatar:delete` | Converted. |
| `GET /api/:realm/billing/usage/summary` | User-delegated platform resource | OAuth token for the exact billing resource with `billing:usage:read` | Converted. |
| Billing usage `consume`, `reserve`, `commit`, and `release` | Service-only platform resource | Client Credentials token plus an explicit user subject | Convert after the summary endpoint. A browser or user token must not mutate authoritative quota state. |
| Product-specific business operations | Product-owned business boundary | Product-local Better Auth session | Keep out of the auth platform unless the capability is genuinely shared. |

## Registered resources

### Avatar storage

For realm `demo` at `https://auth.example.com`:

```text
resource = https://auth.example.com/api/demo/upload
scopes   = storage:avatar:write storage:avatar:delete
metadata = https://auth.example.com/.well-known/oauth-protected-resource/api/demo/upload
issuer   = https://auth.example.com/api/demo
```

The authorization server owns resource registration, allowed scopes, client
links, authorization grants, and token issuance through the Better Auth OAuth
Provider plugin. The HTTP resource boundary owns only request verification and
the domain operation after verified `sub`, `azp`, `iss`, `aud`, expiry, scope,
and optional DPoP binding.

### Billing usage

For the same realm:

```text
resource = https://auth.example.com/api/demo/billing
scopes   = billing:usage:read
metadata = https://auth.example.com/.well-known/oauth-protected-resource/api/demo/billing
issuer   = https://auth.example.com/api/demo
```

There is deliberately no cookie or bearer-session fallback on either
user-delegated resource. Trusted-origin CORS remains a browser transport
policy; it is not an authentication mechanism. Billing quota mutations remain
separate because they will accept only a service-client credential and an
explicit user subject.
