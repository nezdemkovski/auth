# Registry Diff-Based Rebuilds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop rebuilding the full `betterAuth()` instance on every realm mutation. `AuthRegistry.updateProject`/`patchProject` must rebuild the Better Auth instance only when a field that actually feeds the auth configuration changes; metadata-only patches (e.g. `iconUrl`, app-owned `storage`) must swap the stored project record in place, keeping the existing `ProjectAuth` instance and database pool. `updateEmailContribution` keeps its eager all-realm rebuild (justified below) but gains a regression test locking its semantics.

**Architecture:** A new `field-impact` module in `packages/platform/better-auth-runtime` owns the classification of every `Realm` field, derived from what `buildProjectAuthOptions` (packages/platform/better-auth-runtime/src/auth.ts:176-339) actually reads:

| Realm field | Impact | Evidence in `buildProjectAuthOptions` |
|---|---|---|
| `slug` | Immutable | map key; baseURL, cookiePrefix, jwt issuer/audience — never changes at runtime |
| `schema` | Immutable | Postgres `search_path` (database.ts:16); guarded by existing throw (registry.ts:60-62) |
| `name` | AuthConfig | `appName` (auth.ts:226), passkey `rpName` (246), twoFactor `issuer` (251), agentAuth `providerName` (255), email template subjects via contribution |
| `description` | AuthConfig | agentAuth `providerDescription` (256) and `realm.info` capability payload (279) |
| `trustedOrigins` | AuthConfig | `trustedOrigins` option (230); also read by the billing plugin contribution |
| `features` | AuthConfig | twoFactor post-login policy closure (198), `dynamicClientRegistration` (203), oauthProvider `enabled`/`resources` (206-208) |
| `socialProviders` | AuthConfig | `buildSocialProviders` (231, 345-361), Telegram OIDC plugin (284, 363-373) |
| `iconUrl` | Metadata | not read anywhere in auth options or any contribution |
| `appUrl` | Metadata | not read by `buildProjectAuthOptions`; the apps/api billing contribution *does* read it, so apps/api promotes it (see below) |

Because contributions receive the whole project, the runtime cannot know which app-extension fields (e.g. `billing`, `storage` on `AuthProject`) feed contributed plugins. Two new registry options close the gap:

- `authAffectingKeys` — keys (Realm-metadata or extension) that the app's contributions read; changes force a rebuild. apps/api passes `["appUrl", "billing"]` because `createBillingAuthPluginContribution` (apps/api/src/modules/billing/better-auth.ts:19,39) reads `project.billing` and `project.appUrl` at plugin-build time.
- `metadataOnlyKeys` — extension keys guaranteed unread by any contribution; changes skip the rebuild. apps/api passes `["storage"]`.
- Any extension key in **neither** list defaults to rebuild — the safe, behavior-preserving default (an app that forgets to classify a new field gets the old behavior, never silent staleness).

**`updateEmailContribution` decision — eager rebuild kept, lazy rejected:** the email contribution feeds `emailAndPassword`/`emailVerification`/`user` options of *every* realm, so any correct approach must eventually rebuild each realm; lazy stale-marking only defers the same work. Lazy would also (a) break the synchronous `registry.get()` used by the per-request middleware (rebuild requires `await auth.ready()` before swap), (b) lose the current atomic all-or-nothing rollback on failure (registry.ts:118-126), and (c) move the cost into first-request latency spikes. Delivery-settings changes are a rare admin action, and `auth.ready()` does not hit the database (the existing unit tests run the rebuild path against an unreachable DB URL), so eager O(N) is the simpler correct option. It stays, locked by a new test.

**Tech Stack:** TypeScript, Bun (`bun:test`), `node:util` `isDeepStrictEqual` for field diffing (supported by Bun), turborepo. No new dependencies.

## Global Constraints

- READ the repo conventions first: `docs/adr/`, `AGENTS.md`. TDD, one behavior-preserving slice per task.
- Run `bun run typecheck` and `bun run test` from the repo root after each task; both must pass before committing.
- Arrow functions for standalone functions; keep `function` declarations only for type guards (`value is T`).
- Enums for closed domain values (`RealmFieldImpact` is an enum).
- No `as` casts, no angle-bracket assertions, anywhere including tests. Use type guards and structural types.
- Tests use neutral fixtures only: `demo`, `Demo App`, `demo.example.com`, `user@example.com`. Reuse `ADMIN_REALM`/`ADMIN_PROJECT` fixtures as the existing tests do.
- `apps/api` resolves `@nezdemkovski/auth-better-auth-runtime` via its gitignored `dist/`. Before running apps/api tests directly, rebuild the package: `cd /Users/yuri/Sites/auth/packages/platform/better-auth-runtime && bun run build`. (Root `bun run test` handles this via turbo `dependsOn: ["^build"]`.)
- Do NOT change `removeProject`, `close`, `ready`, or the schema-immutability throw. Do NOT change any HTTP callers (`apps/api/src/http/app.ts`, `apps/api/src/http/admin.ts`, `apps/api/src/modules/projects/core.ts`) — the optimization is entirely inside the registry layer.
- If the repo's `commit-and-push` skill is mandated in your session, use it with the exact messages below instead of raw `git commit`.

### Task 1: Realm field impact classification module

**Files:**
- Create: `/Users/yuri/Sites/auth/packages/platform/better-auth-runtime/src/field-impact.ts`
- Create: `/Users/yuri/Sites/auth/packages/platform/better-auth-runtime/src/__tests__/field-impact.test.ts`
- Modify: `/Users/yuri/Sites/auth/packages/platform/better-auth-runtime/src/index.ts` (append export block after the `./database` exports, lines 7-10)

**Interfaces:**
- Consumes: `Realm` type and `ADMIN_REALM` fixture from `@nezdemkovski/auth-realm`; `isDeepStrictEqual` from `node:util`.
- Produces:
  - `enum RealmFieldImpact { AuthConfig = "auth-config", Metadata = "metadata", Immutable = "immutable" }`
  - `const REALM_FIELD_IMPACT: Record<keyof Realm, RealmFieldImpact>` (compile-time exhaustive: a new `Realm` field breaks `bun run typecheck` until classified)
  - `const changedProjectKeys: (current: Realm, next: Realm) => string[]`
  - `const projectAuthRebuildRequired: (options: { current: Realm; next: Realm; authAffectingKeys: readonly string[]; metadataOnlyKeys: readonly string[] }) => boolean`

- [ ] **Step 1: Write the failing test**

Create `/Users/yuri/Sites/auth/packages/platform/better-auth-runtime/src/__tests__/field-impact.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { ADMIN_REALM } from "@nezdemkovski/auth-realm";

import {
  changedProjectKeys,
  projectAuthRebuildRequired,
  REALM_FIELD_IMPACT,
  RealmFieldImpact
} from "../field-impact";

describe("realm field impact classification", () => {
  test("classifies exactly the current Realm fields", () => {
    expect(Object.keys(REALM_FIELD_IMPACT).sort()).toEqual([
      "appUrl",
      "description",
      "features",
      "iconUrl",
      "name",
      "schema",
      "slug",
      "socialProviders",
      "trustedOrigins"
    ]);
    expect(Object.keys(REALM_FIELD_IMPACT).sort()).toEqual(
      Object.keys(ADMIN_REALM).sort()
    );
  });

  test("marks every auth-config field explicitly", () => {
    expect(REALM_FIELD_IMPACT.name).toBe(RealmFieldImpact.AuthConfig);
    expect(REALM_FIELD_IMPACT.description).toBe(RealmFieldImpact.AuthConfig);
    expect(REALM_FIELD_IMPACT.trustedOrigins).toBe(RealmFieldImpact.AuthConfig);
    expect(REALM_FIELD_IMPACT.features).toBe(RealmFieldImpact.AuthConfig);
    expect(REALM_FIELD_IMPACT.socialProviders).toBe(RealmFieldImpact.AuthConfig);
    expect(REALM_FIELD_IMPACT.iconUrl).toBe(RealmFieldImpact.Metadata);
    expect(REALM_FIELD_IMPACT.appUrl).toBe(RealmFieldImpact.Metadata);
    expect(REALM_FIELD_IMPACT.slug).toBe(RealmFieldImpact.Immutable);
    expect(REALM_FIELD_IMPACT.schema).toBe(RealmFieldImpact.Immutable);
  });
});

describe("changedProjectKeys", () => {
  test("reports deep changes and ignores identical structures", () => {
    const next = {
      ...ADMIN_REALM,
      iconUrl: "https://demo.example.com/icon.png",
      features: {
        ...ADMIN_REALM.features,
        passkey: { enabled: true }
      }
    };

    expect(changedProjectKeys(ADMIN_REALM, { ...ADMIN_REALM })).toEqual([]);
    expect(changedProjectKeys(ADMIN_REALM, next).sort()).toEqual([
      "features",
      "iconUrl"
    ]);
  });
});

describe("projectAuthRebuildRequired", () => {
  const bare = { authAffectingKeys: [], metadataOnlyKeys: [] };

  test("metadata-only realm changes do not require a rebuild", () => {
    expect(
      projectAuthRebuildRequired({
        current: ADMIN_REALM,
        next: { ...ADMIN_REALM, iconUrl: "https://demo.example.com/icon.png" },
        ...bare
      })
    ).toBe(false);
  });

  test("auth-config realm changes require a rebuild", () => {
    expect(
      projectAuthRebuildRequired({
        current: ADMIN_REALM,
        next: { ...ADMIN_REALM, trustedOrigins: ["https://demo.example.com"] },
        ...bare
      })
    ).toBe(true);
    expect(
      projectAuthRebuildRequired({
        current: ADMIN_REALM,
        next: {
          ...ADMIN_REALM,
          features: {
            ...ADMIN_REALM.features,
            twoFactor: { ...ADMIN_REALM.features.twoFactor, enabled: true }
          }
        },
        ...bare
      })
    ).toBe(true);
  });

  test("unknown extension keys require a rebuild by default", () => {
    expect(
      projectAuthRebuildRequired({
        current: { ...ADMIN_REALM, runtimeLabel: "before" },
        next: { ...ADMIN_REALM, runtimeLabel: "after" },
        ...bare
      })
    ).toBe(true);
  });

  test("declared metadata-only extension keys skip the rebuild", () => {
    expect(
      projectAuthRebuildRequired({
        current: { ...ADMIN_REALM, runtimeLabel: "before" },
        next: { ...ADMIN_REALM, runtimeLabel: "after" },
        authAffectingKeys: [],
        metadataOnlyKeys: ["runtimeLabel"]
      })
    ).toBe(false);
  });

  test("authAffectingKeys promotes metadata realm fields to rebuild", () => {
    expect(
      projectAuthRebuildRequired({
        current: ADMIN_REALM,
        next: { ...ADMIN_REALM, appUrl: "https://demo.example.com" },
        authAffectingKeys: ["appUrl"],
        metadataOnlyKeys: []
      })
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/yuri/Sites/auth/packages/platform/better-auth-runtime && bun test src/__tests__/field-impact.test.ts
```

Expected failure: module resolution error — `Cannot find module '../field-impact'` (or equivalent Bun resolve error), all tests fail.

- [ ] **Step 3: Write minimal implementation**

Create `/Users/yuri/Sites/auth/packages/platform/better-auth-runtime/src/field-impact.ts`:

```ts
import { isDeepStrictEqual } from "node:util";

import type { Realm } from "@nezdemkovski/auth-realm";

export enum RealmFieldImpact {
  AuthConfig = "auth-config",
  Metadata = "metadata",
  Immutable = "immutable"
}

export const REALM_FIELD_IMPACT: Record<keyof Realm, RealmFieldImpact> = {
  slug: RealmFieldImpact.Immutable,
  schema: RealmFieldImpact.Immutable,
  name: RealmFieldImpact.AuthConfig,
  description: RealmFieldImpact.AuthConfig,
  iconUrl: RealmFieldImpact.Metadata,
  appUrl: RealmFieldImpact.Metadata,
  trustedOrigins: RealmFieldImpact.AuthConfig,
  features: RealmFieldImpact.AuthConfig,
  socialProviders: RealmFieldImpact.AuthConfig
};

function isRealmFieldKey(key: string): key is keyof Realm {
  return key in REALM_FIELD_IMPACT;
}

const projectFieldRecord = (project: Realm): Record<string, unknown> => {
  return Object.fromEntries(Object.entries(project));
};

export const changedProjectKeys = (current: Realm, next: Realm): string[] => {
  const currentFields = projectFieldRecord(current);
  const nextFields = projectFieldRecord(next);
  const keys = new Set([
    ...Object.keys(currentFields),
    ...Object.keys(nextFields)
  ]);

  return [...keys].filter(
    (key) => !isDeepStrictEqual(currentFields[key], nextFields[key])
  );
};

export const projectAuthRebuildRequired = (options: {
  current: Realm;
  next: Realm;
  authAffectingKeys: readonly string[];
  metadataOnlyKeys: readonly string[];
}): boolean => {
  return changedProjectKeys(options.current, options.next).some((key) => {
    if (options.authAffectingKeys.includes(key)) {
      return true;
    }
    if (isRealmFieldKey(key)) {
      return REALM_FIELD_IMPACT[key] !== RealmFieldImpact.Metadata;
    }

    return !options.metadataOnlyKeys.includes(key);
  });
};
```

Append to `/Users/yuri/Sites/auth/packages/platform/better-auth-runtime/src/index.ts` (after the `./database` export block ending at line 10):

```ts
export {
  changedProjectKeys,
  projectAuthRebuildRequired,
  REALM_FIELD_IMPACT,
  RealmFieldImpact
} from "./field-impact";
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/yuri/Sites/auth/packages/platform/better-auth-runtime && bun test src/__tests__/field-impact.test.ts && cd /Users/yuri/Sites/auth && bun run typecheck && bun run test
```

- [ ] **Step 5: Commit**

```bash
cd /Users/yuri/Sites/auth && git add packages/platform/better-auth-runtime/src/field-impact.ts packages/platform/better-auth-runtime/src/__tests__/field-impact.test.ts packages/platform/better-auth-runtime/src/index.ts && git commit -m "feat(auth): classify realm fields by auth impact"
```

### Task 2: Diff-based rebuild fast path in AuthRegistry.updateProject

**Files:**
- Modify: `/Users/yuri/Sites/auth/packages/platform/better-auth-runtime/src/registry.ts` — add option fields to `AuthRegistryOptions` (lines 21-31), add private fields + validation in the constructor (lines 37-42), add the fast path at the top of `updateProject` (lines 58-74). `patchProject` (lines 76-89) needs no change — it delegates to `updateProject` and inherits the diffing.
- Test: `/Users/yuri/Sites/auth/packages/platform/better-auth-runtime/src/__tests__/registry.test.ts` (append tests inside the existing `describe`)

**Interfaces:**
- Consumes: `projectAuthRebuildRequired` from `./field-impact`.
- Produces (added to `AuthRegistryOptions<TProject>`):
  - `authAffectingKeys?: readonly (keyof TProject & string)[]`
  - `metadataOnlyKeys?: readonly Exclude<keyof TProject & string, keyof Realm>[]`
  - Constructor throws `Error("Keys cannot be both auth-affecting and metadata-only: <keys>")` on overlap.
  - `updateProject(project: TProject): Promise<void>` — unchanged signature; when no auth-affecting field changed for an existing project, it replaces only the stored `project` record (same `auth`, same `projectDb`) and resolves without awaiting `auth.ready()`.

- [ ] **Step 1: Write the failing test**

Append inside `describe("auth registry lifecycle", ...)` in `/Users/yuri/Sites/auth/packages/platform/better-auth-runtime/src/__tests__/registry.test.ts` (the file already defines `TestProject`, `protocol`, and imports `ADMIN_REALM`; extract the repeated constructor options into a local helper to comply with the duplication rule):

```ts
  const registryOptions = (projects: TestProject[]) => ({
    databaseUrl: "postgres://auth:auth@127.0.0.1:5432/auth",
    publicBaseUrl: "https://auth.example.com",
    secret: "x".repeat(32),
    trustedClientIpHeader: "x-demo-client-ip",
    trustProxyHeaders: false,
    projects,
    protocol
  });

  test("keeps the auth instance for metadata-only realm patches", async () => {
    const project: TestProject = { ...ADMIN_REALM, runtimeLabel: "demo" };
    const registry = new AuthRegistry(registryOptions([project]));

    try {
      const before = registry.get(project.slug);
      await registry.patchProject(project.slug, {
        iconUrl: "https://demo.example.com/icon.png"
      });
      const after = registry.get(project.slug);

      expect(after?.auth).toBe(before?.auth);
      expect(after?.projectDb).toBe(before?.projectDb);
      expect(after?.project.iconUrl).toBe("https://demo.example.com/icon.png");
    } finally {
      await registry.close();
    }
  });

  test("rebuilds the auth instance when trusted origins change", async () => {
    const project: TestProject = { ...ADMIN_REALM, runtimeLabel: "demo" };
    const registry = new AuthRegistry(registryOptions([project]));

    try {
      const before = registry.get(project.slug);
      await registry.patchProject(project.slug, {
        trustedOrigins: ["https://demo.example.com"]
      });
      const after = registry.get(project.slug);

      expect(after?.auth).not.toBe(before?.auth);
      expect(after?.projectDb).toBe(before?.projectDb);
    } finally {
      await registry.close();
    }
  });

  test("rebuilds for undeclared app-owned keys but not for declared metadata-only keys", async () => {
    const project: TestProject = { ...ADMIN_REALM, runtimeLabel: "before" };
    const rebuilding = new AuthRegistry(registryOptions([project]));
    const skipping = new AuthRegistry({
      ...registryOptions([project]),
      metadataOnlyKeys: ["runtimeLabel"]
    });

    try {
      const rebuildingBefore = rebuilding.get(project.slug);
      await rebuilding.patchProject(project.slug, { runtimeLabel: "after" });
      expect(rebuilding.get(project.slug)?.auth).not.toBe(rebuildingBefore?.auth);

      const skippingBefore = skipping.get(project.slug);
      await skipping.patchProject(project.slug, { runtimeLabel: "after" });
      expect(skipping.get(project.slug)?.auth).toBe(skippingBefore?.auth);
      expect(skipping.get(project.slug)?.project.runtimeLabel).toBe("after");
    } finally {
      await rebuilding.close();
      await skipping.close();
    }
  });

  test("authAffectingKeys promotes metadata realm fields to rebuild", async () => {
    const project: TestProject = { ...ADMIN_REALM, runtimeLabel: "demo" };
    const registry = new AuthRegistry({
      ...registryOptions([project]),
      authAffectingKeys: ["appUrl"]
    });

    try {
      const before = registry.get(project.slug);
      await registry.patchProject(project.slug, {
        appUrl: "https://demo.example.com"
      });
      expect(registry.get(project.slug)?.auth).not.toBe(before?.auth);
    } finally {
      await registry.close();
    }
  });

  test("rejects keys declared both auth-affecting and metadata-only", () => {
    const project: TestProject = { ...ADMIN_REALM, runtimeLabel: "demo" };

    expect(
      () =>
        new AuthRegistry({
          ...registryOptions([project]),
          authAffectingKeys: ["runtimeLabel"],
          metadataOnlyKeys: ["runtimeLabel"]
        })
    ).toThrow("Keys cannot be both auth-affecting and metadata-only: runtimeLabel");
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/yuri/Sites/auth/packages/platform/better-auth-runtime && bun test src/__tests__/registry.test.ts
```

Expected failures: TypeScript/Bun accepts unknown extra options at runtime, so the concrete failures are: "keeps the auth instance for metadata-only realm patches" fails on `expect(after?.auth).toBe(before?.auth)` (a new auth instance is built today); the `metadataOnlyKeys` and overlap tests fail similarly (`.toBe` identity mismatch; `toThrow` receives no error). `bun run typecheck` would also fail on the unknown option keys — implement before typechecking.

- [ ] **Step 3: Write minimal implementation**

In `/Users/yuri/Sites/auth/packages/platform/better-auth-runtime/src/registry.ts`:

Add the import (after the existing `./auth` import at line 7):

```ts
import { projectAuthRebuildRequired } from "./field-impact";
```

Extend `AuthRegistryOptions` (append inside the type, after `pluginContributions` at line 30):

```ts
  authAffectingKeys?: readonly (keyof TProject & string)[];
  metadataOnlyKeys?: readonly Exclude<keyof TProject & string, keyof Realm>[];
```

Add private fields and validation at the top of the class/constructor (lines 33-42 become):

```ts
export class AuthRegistry<TProject extends Realm = Realm> {
  private projects = new Map<string, RegisteredProject<TProject>>();
  private options: AuthRegistryOptions<TProject>;
  private readonly authAffectingKeys: readonly string[];
  private readonly metadataOnlyKeys: readonly string[];

  constructor(options: AuthRegistryOptions<TProject>) {
    this.authAffectingKeys = options.authAffectingKeys ?? [];
    this.metadataOnlyKeys = options.metadataOnlyKeys ?? [];
    const overlap = this.authAffectingKeys.filter((key) =>
      this.metadataOnlyKeys.includes(key)
    );
    if (overlap.length > 0) {
      throw new Error(
        `Keys cannot be both auth-affecting and metadata-only: ${overlap.join(", ")}`
      );
    }
    this.options = options;
    for (const project of options.projects) {
      this.projects.set(project.slug, this.createRegisteredProject(project));
    }
  }
```

Add the fast path in `updateProject` (after the schema guard at lines 60-62, before `const next = ...`):

```ts
    if (
      current &&
      !projectAuthRebuildRequired({
        current: current.project,
        next: project,
        authAffectingKeys: this.authAffectingKeys,
        metadataOnlyKeys: this.metadataOnlyKeys
      })
    ) {
      this.projects.set(project.slug, { ...current, project });
      return;
    }
```

Everything else in the file stays byte-identical.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/yuri/Sites/auth/packages/platform/better-auth-runtime && bun test src/__tests__/registry.test.ts && cd /Users/yuri/Sites/auth && bun run typecheck && bun run test
```

The two pre-existing tests in this file must still pass unmodified (the `runtimeLabel` patch test asserts pool reuse only, which holds on both paths).

- [ ] **Step 5: Commit**

```bash
cd /Users/yuri/Sites/auth && git add packages/platform/better-auth-runtime/src/registry.ts packages/platform/better-auth-runtime/src/__tests__/registry.test.ts && git commit -m "perf(auth): skip auth rebuilds for metadata-only realm patches"
```

### Task 3: Lock eager rebuild semantics for updateEmailContribution

**Files:**
- Modify: none (decision: keep eager O(N) rebuild in `updateEmailContribution`, `/Users/yuri/Sites/auth/packages/platform/better-auth-runtime/src/registry.ts` lines 101-127, unchanged)
- Test: `/Users/yuri/Sites/auth/packages/platform/better-auth-runtime/src/__tests__/registry.test.ts` (append one test)

**Interfaces:**
- Consumes: `AuthRegistry.updateEmailContribution(emailContribution: ProjectAuthEmailContribution<TProject> | undefined): Promise<void>` — existing signature.
- Produces: a regression test guaranteeing that (a) every realm gets a fresh `ProjectAuth` after an email-contribution change (handlers are baked into `betterAuth()` options, so reuse would serve stale delivery settings) and (b) database pools are reused. Rationale for rejecting lazy stale-marking is recorded in the plan header: `get()` must stay synchronous for the request hot path, atomic rollback (lines 118-126) must be preserved, and the operation is a rare admin action.

- [ ] **Step 1: Write the failing test**

Append inside the same `describe` block (uses the `registryOptions` helper from Task 2):

```ts
  test("email contribution updates rebuild every realm and keep pools", async () => {
    const first: TestProject = { ...ADMIN_REALM, runtimeLabel: "demo" };
    const second: TestProject = {
      ...ADMIN_REALM,
      slug: "demo",
      schema: "demo_auth",
      runtimeLabel: "demo"
    };
    const registry = new AuthRegistry(registryOptions([first, second]));

    try {
      const firstBefore = registry.get(first.slug);
      const secondBefore = registry.get(second.slug);

      await registry.updateEmailContribution(() => ({}));

      const firstAfter = registry.get(first.slug);
      const secondAfter = registry.get(second.slug);

      expect(firstAfter?.auth).not.toBe(firstBefore?.auth);
      expect(secondAfter?.auth).not.toBe(secondBefore?.auth);
      expect(firstAfter?.projectDb).toBe(firstBefore?.projectDb);
      expect(secondAfter?.projectDb).toBe(secondBefore?.projectDb);
    } finally {
      await registry.close();
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/yuri/Sites/auth/packages/platform/better-auth-runtime && bun test src/__tests__/registry.test.ts
```

Expected: this test PASSES immediately because it locks existing behavior. Verify it is a real test by mutation check: temporarily change `updateEmailContribution` line 114 to reuse `current` instead of `this.createRegisteredProject(...)` (i.e. `nextProjects.set(current.project.slug, current)`), rerun, and confirm the test now FAILS on `expect(firstAfter?.auth).not.toBe(firstBefore?.auth)`. Revert the mutation.

- [ ] **Step 3: Write minimal implementation**

No production code change. `updateEmailContribution` (registry.ts lines 101-127) remains exactly as-is. Confirm with:

```bash
cd /Users/yuri/Sites/auth && git diff packages/platform/better-auth-runtime/src/registry.ts
```

Expected output: empty (no diff since Task 2's commit).

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/yuri/Sites/auth/packages/platform/better-auth-runtime && bun test src/__tests__/registry.test.ts && cd /Users/yuri/Sites/auth && bun run typecheck && bun run test
```

- [ ] **Step 5: Commit**

```bash
cd /Users/yuri/Sites/auth && git add packages/platform/better-auth-runtime/src/__tests__/registry.test.ts && git commit -m "test(auth): lock eager realm rebuilds on email contribution updates"
```

### Task 4: Declare apps/api contribution-read keys on the app registry

**Files:**
- Modify: `/Users/yuri/Sites/auth/apps/api/src/auth/registry.ts` — extend the `Omit` in `RegistryOptions` (lines 17-22) and pass the key declarations in the `super(...)` call (lines 26-31)
- Test: `/Users/yuri/Sites/auth/apps/api/src/auth/__tests__/registry.test.ts` (append tests)

**Interfaces:**
- Consumes: runtime `AuthRegistryOptions<AuthProject>` with the Task 2 options. `AuthProject = Realm & { billing: ProjectBillingSettings; storage: ProjectStorageSettings }` (apps/api/src/config/projects.ts:11-14).
- Produces: app `AuthRegistry` constructor hard-codes `authAffectingKeys: ["appUrl", "billing"]` (the billing plugin contribution reads `project.billing`, `project.appUrl`, `project.trustedOrigins` at build time — apps/api/src/modules/billing/better-auth.ts:19,39) and `metadataOnlyKeys: ["storage"]` (storage is read only by `StorageService`, never by auth options or any contribution). Net effect on live callers with zero call-site changes: `registry.patchProject(slug, { storage })` (apps/api/src/http/app.ts:133) and `patchProject(slug, { iconUrl })` (app.ts:156) no longer rebuild Better Auth; `patchProject(slug, { billing })` (apps/api/src/http/admin.ts:42) still rebuilds; `ProjectService.updateProject`/`updateSocialProvider`/`verifySocialProvider` rebuild only when auth-affecting fields actually changed.

- [ ] **Step 1: Write the failing test**

Append inside `describe("auth registry lifecycle", ...)` in `/Users/yuri/Sites/auth/apps/api/src/auth/__tests__/registry.test.ts` (file already imports `ADMIN_PROJECT`, `AuthRegistry`, `StorageProvider`, `DEFAULT_PROJECT_BILLING`; extract the constructor options into a local helper mirroring the existing test's literal):

```ts
  const registryOptions = () => ({
    databaseUrl: "postgres://auth:auth@127.0.0.1:5432/auth",
    publicBaseUrl: "https://auth.example.com",
    secret: "x".repeat(32),
    emailSender: null,
    trustProxyHeaders: false,
    projects: [ADMIN_PROJECT]
  });

  test("storage and icon patches keep the running auth instance", async () => {
    const registry = new AuthRegistry(registryOptions());

    try {
      const before = registry.get(ADMIN_PROJECT.slug);
      await registry.patchProject(ADMIN_PROJECT.slug, {
        storage: {
          ...ADMIN_PROJECT.storage,
          provider: StorageProvider.S3,
          enabled: true
        }
      });
      await registry.patchProject(ADMIN_PROJECT.slug, {
        iconUrl: "https://demo.example.com/icon.png"
      });
      const after = registry.get(ADMIN_PROJECT.slug);

      expect(after?.auth).toBe(before?.auth);
      expect(after?.projectDb).toBe(before?.projectDb);
      expect(after?.project.storage.enabled).toBe(true);
      expect(after?.project.iconUrl).toBe("https://demo.example.com/icon.png");
    } finally {
      await registry.close();
    }
  });

  test("billing patches rebuild the auth instance", async () => {
    const registry = new AuthRegistry(registryOptions());

    try {
      const before = registry.get(ADMIN_PROJECT.slug);
      await registry.patchProject(ADMIN_PROJECT.slug, {
        billing: {
          ...DEFAULT_PROJECT_BILLING,
          enabled: true
        }
      });
      const after = registry.get(ADMIN_PROJECT.slug);

      expect(after?.auth).not.toBe(before?.auth);
      expect(after?.projectDb).toBe(before?.projectDb);
    } finally {
      await registry.close();
    }
  });

  test("app URL patches rebuild the auth instance", async () => {
    const registry = new AuthRegistry(registryOptions());

    try {
      const before = registry.get(ADMIN_PROJECT.slug);
      await registry.patchProject(ADMIN_PROJECT.slug, {
        appUrl: "https://demo.example.com"
      });
      const after = registry.get(ADMIN_PROJECT.slug);

      expect(after?.auth).not.toBe(before?.auth);
    } finally {
      await registry.close();
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/yuri/Sites/auth/packages/platform/better-auth-runtime && bun run build && cd /Users/yuri/Sites/auth/apps/api && bun test src/auth/__tests__/registry.test.ts
```

Expected failure: "storage and icon patches keep the running auth instance" fails on `expect(after?.auth).toBe(before?.auth)` — without declarations, `storage` is an undeclared extension key and defaults to rebuild. (The billing and appUrl tests pass already via the safe default and stay as regression guards.)

- [ ] **Step 3: Write minimal implementation**

In `/Users/yuri/Sites/auth/apps/api/src/auth/registry.ts`, replace lines 17-22 and 24-32 with:

```ts
type RegistryOptions = Omit<
  RuntimeRegistryOptions<AuthProject>,
  | "emailContribution"
  | "protocol"
  | "trustedClientIpHeader"
  | "authAffectingKeys"
  | "metadataOnlyKeys"
> & {
  emailSender: EmailSender | null;
};

export class AuthRegistry extends RuntimeAuthRegistry<AuthProject> {
  constructor(options: RegistryOptions) {
    super({
      ...options,
      trustedClientIpHeader: TRUSTED_CLIENT_IP_HEADER,
      protocol: createProjectAuthProtocolOptions(options.publicBaseUrl),
      emailContribution: createProjectAuthEmailContribution(options.emailSender),
      // Read at plugin-build time by createBillingAuthPluginContribution.
      authAffectingKeys: ["appUrl", "billing"],
      // Consumed only by StorageService, never by Better Auth options.
      metadataOnlyKeys: ["storage"]
    });
  }
```

(`updateEmailSender` at lines 34-38 stays unchanged.)

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/yuri/Sites/auth/apps/api && bun test src/auth/__tests__/registry.test.ts && cd /Users/yuri/Sites/auth && bun run typecheck && bun run test
```

The pre-existing test "merges realm patches without replacing the active database pool" must still pass: it asserts pool identity and merged `storage`/`billing` values, both of which hold on the new fast path and the rebuild path respectively.

- [ ] **Step 5: Commit**

```bash
cd /Users/yuri/Sites/auth && git add apps/api/src/auth/registry.ts apps/api/src/auth/__tests__/registry.test.ts && git commit -m "perf(api): declare app-owned realm keys for diff-based rebuilds"
```

### Task 5: Full-suite verification and boundary check

**Files:**
- Create/Modify: none
- Test: whole repo

**Interfaces:** none — this slice only proves the previous slices are behavior-preserving end to end.

- [ ] **Step 1: Write the failing test** — not applicable; this task runs the existing suites. Skip to Step 2.
- [ ] **Step 2: Run the full verification**

```bash
cd /Users/yuri/Sites/auth && bun run typecheck && bun run test
```

Expected: all packages typecheck; `turbo run test`, `turbo boundaries`, and `bun test tests/repository-controls.test.ts` all pass (the `field-impact.ts` import of `@nezdemkovski/auth-realm` respects the `platform → domain` boundary already used by `registry.ts`).

- [ ] **Step 3: Grep for missed callers** — confirm no caller relies on rebuild side effects for metadata patches:

```bash
cd /Users/yuri/Sites/auth && grep -rn "patchProject\|updateProject(" apps/api/src packages --include="*.ts" | grep -v node_modules | grep -v dist
```

Expected call sites and their behavior after this change: `app.ts:133` (storage — no rebuild), `app.ts:156` (iconUrl — no rebuild), `admin.ts:42` (billing — rebuild), `projects/core.ts:134,240,321` (create/update/social — rebuild only when auth-affecting fields changed), `projects/core.ts:373` (socialProviders after verification — rebuild, since `verifiedAt` lives inside `socialProviders`, an AuthConfig field; behavior-preserving), `apps/api registry tests`. No changes required.

- [ ] **Step 4: Re-run to confirm green** (same command as Step 2, must exit 0).
- [ ] **Step 5: Commit** — nothing to commit; if any fixups were needed, commit them as:

```bash
cd /Users/yuri/Sites/auth && git add -A && git commit -m "chore(auth): fixups from diff-based rebuild verification"
```

### Critical Files for Implementation

- /Users/yuri/Sites/auth/packages/platform/better-auth-runtime/src/registry.ts
- /Users/yuri/Sites/auth/packages/platform/better-auth-runtime/src/auth.ts
- /Users/yuri/Sites/auth/packages/platform/better-auth-runtime/src/__tests__/registry.test.ts
- /Users/yuri/Sites/auth/apps/api/src/auth/registry.ts
- /Users/yuri/Sites/auth/apps/api/src/modules/billing/better-auth.ts
