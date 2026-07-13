# Auth SDK

The SDK is split into three publishable packages with one-way dependencies:

```text
@nezdemkovski/auth-client ─┐
                           ├─> @nezdemkovski/auth-contracts
@nezdemkovski/auth-server ─┘
```

`auth-contracts` owns stable public DTOs, enums, and parsers for untrusted JSON.
`auth-client` owns hosted login, PKCE, session lifecycle, access-token refresh,
Telegram Mini App sign-in, authenticated fetch, billing reads, and avatar
management. `auth-server` owns Bearer extraction and realm JWT verification.

Product user provisioning, permissions, domain data, and business workflows do
not belong in these packages.

## Client integration

```ts
import {
  createAuthClient,
  createKeyValueAuthStorage
} from "@nezdemkovski/auth-client";

const auth = createAuthClient({
  baseUrl: process.env.AUTH_BASE_URL,
  realm: process.env.AUTH_REALM,
  storage: createKeyValueAuthStorage(AsyncStorage)
});

await auth.session.initialize();

const loginUrl = await auth.login.createUrl({
  redirectUri: "https://demo.example.com/auth/callback"
});

await auth.login.complete({
  callbackUrl: window.location.href,
  redirectUri: "https://demo.example.com/auth/callback"
});

const response = await auth.fetch("https://api.demo.example.com/profile");
```

The client keeps the realm session credential private. Applications receive a
short-lived access token through `auth.session.getAccessToken()` and must not
forward the realm session credential to their own backend.

Storage is adapter-based. Memory storage is the safe default for short-lived
browser use. React Native and Expo apps can wrap AsyncStorage with
`createKeyValueAuthStorage`. Platforms without Web Crypto can provide an
`AuthCrypto` adapter.

## Server integration

```ts
import { createRealmAuth } from "@nezdemkovski/auth-server";

const auth = createRealmAuth({
  baseUrl: process.env.AUTH_BASE_URL,
  realm: process.env.AUTH_REALM
});

const identity = await auth.verifyRequest(request);
const productUser = await findOrCreateProductUser(identity.id);
```

Remote JWKS keys are cached by `jose`. Verification checks the signature,
issuer, audience, expiry, realm claim, and public identity claim types.

## Versioning boundary

All three packages start on the same version. A contract change must first be
additive and supported by the API before clients depend on it. Removing a field
or changing its meaning requires a major package version and a compatibility
window in the API.

## Publishing

SDK releases are published to the public npm registry by
`.github/workflows/publish-sdk.yml`. All three packages use fixed, matching
versions so published dependencies never contain the local `workspace:`
protocol.

For the first release, publish the three packages once in dependency order and
configure each npm package's trusted publisher for:

```text
GitHub owner: nezdemkovski
Repository: auth
Workflow: publish-sdk.yml
```

Subsequent releases require updating the version in all three package manifests
and the internal `auth-contracts` dependency versions, then pushing a matching
tag such as `sdk-v0.2.0`. The workflow validates version alignment, runs the
full test suite, builds the SDK, refuses existing versions, and publishes in
dependency order: contracts, client, then server.

Consumers install only the packages they need:

```bash
bun add @nezdemkovski/auth-client
bun add @nezdemkovski/auth-server
```
