# Billing Usage Store Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 997-line god-file `packages/domains/billing/src/usage-store.ts` into three layered modules — `usage-schema.ts` (DDL), `usage-store.ts` (typed persistence functions only), and an extended `usage-core.ts` (reservation/commit/idempotency/sweep/grant business rules) — with zero change to the package's public export surface and zero change to SQL semantics or transaction boundaries.

**Architecture:** Bottom-up, slice-by-slice extraction that never creates a `store → core` import at any intermediate state: (1) pin uncovered idempotency behavior with characterization tests, (2) move DDL out, (3) extract persistence primitives *in place* inside `usage-store.ts` (SQL moves verbatim into primitives; business functions become thin orchestrators in the same file), (4) cut-paste the quota business cluster (reserve/consume/commit/release/summary/sweeps/replay) to `usage-core.ts`, (5) cut-paste the entitlement-grant business (free-grant reconcile, product grants, Polar grant-store factory) to `usage-core.ts`, (6) final surface audit. Transaction demarcation stays structurally identical: core drives `withUsageDb`/`withUsageTransaction` wrappers exported by the store, so every `withAdminDb` + `db.transaction` boundary is preserved exactly (one `withAdminDb` per operation, sweeps in their own transactions, unique-violation catch outside the rolled-back transaction).

**Tech Stack:** Bun workspaces + Turbo, TypeScript, Drizzle ORM 1.0.0-rc.4 (node-postgres), real-Postgres integration tests via `bun test` in `apps/api/integration/`, unit tests via `bun test` in the billing package.

## Global Constraints

- **Public API frozen.** `packages/domains/billing/src/index.ts` must keep exporting these exact names (module specifiers inside index.ts may change): `BillingEntitlementSourceType`, `BillingUsageReservationStatus`, `commitBillingUsageReservation`, `consumeBillingUsage`, `createPolarEntitlementGrantStore`, `deactivateBillingEntitlementSource`, `deactivateBillingSubscriptionEntitlements`, `ensureBillingUsageTables`, `grantBillingProductEntitlements`, `readBillingUsageSummary`, `releaseBillingUsageReservation`, `reserveBillingUsage`, `type BillingUsageReservationResult`, `type PolarEntitlementGrantStore` (plus all existing non-usage exports untouched). Capture a runtime baseline before Task 2:
  `cd /Users/yuri/Sites/auth/packages/domains/billing && bun -e 'const m = await import("./src/index.ts"); console.log(Object.keys(m).sort().join("\n"))' > /tmp/billing-exports-before.txt`
- **Money-atomicity invariants (SQL must move verbatim, boundaries must not move):**
  1. `reserveBillingUsage`: idempotency pre-check runs on the plain db *outside* the transaction; the unlimited-grant select, the `FOR UPDATE SKIP LOCKED` grant loop (ordered by `priority, created_at`, `LIMIT 1`), the `remaining = remaining - consumed` decrement, and the reservation insert all run inside *one* `db.transaction`; `InsufficientBillingUsageError` is thrown *inside* the transaction so partial decrements roll back; the `isPostgresUniqueViolation` catch runs *after* rollback and re-reads the idempotent reservation on the same db handle.
  2. `commitBillingUsageReservation`: reservation row locked with plain `FOR UPDATE`, status filter `IN (pending, committed)`; already-committed replays return success *without* inserting a second usage event; in-tx expiry check (`expiresAt <= Date.now()`) releases as `Expired` inside the same transaction and returns null.
  3. `releaseBillingUsageReservation`: `FOR UPDATE` with status `= pending` only; consumption restore skips `amount === null` (unlimited) entries.
  4. Expiry sweep: `FOR UPDATE SKIP LOCKED` over expired pendings, restore + status update per reservation inside one transaction; sweeps (`releaseExpired…`, `ensureFree…`, `resetDue…`) always run *before* the main operation in their own transactions, in the current order.
  5. Free-grant reconcile upsert: `onConflictDoNothing` for the non-reconcile path; the reconcile `onConflictDoUpdate` with its `remaining` recompute `CASE`, `resetAt` `IS DISTINCT FROM` guard, and full `setWhere` clause must be moved byte-for-byte (usage-store.ts lines 907–955).
  6. Reservation TTL stays computed in SQL: `now() + (ttl::int * interval '1 second')`, default 900.
  7. `deactivateBillingSubscriptionEntitlements` keeps the `metadata #>> '{data,subscriptionId}'` jsonb path filter.
- **Build before integration runs:** `apps/api` resolves `@nezdemkovski/auth-billing` through `dist/` (package `main`/`exports`). After every source change and before any integration run: `cd /Users/yuri/Sites/auth/packages/domains/billing && bun run build`.
- **Commands per slice (repo migration rule):** `cd /Users/yuri/Sites/auth && bun run typecheck && bun run test`, then integration: `bun run test:integration:up` (once per session) and `cd /Users/yuri/Sites/auth/apps/api && bun test ./integration/billing-usage.integration.ts`. Full `bun run test:integration` in the final task.
- **Style rules:** arrow functions (`export const f = async (…) => {…}`), exported enums for closed values, no `as`/`as unknown as` casts anywhere (including tests), no new dependencies, neutral fixtures in tests. Do not touch `tables.ts` column definitions or `webhook-store.ts`.
- **Import direction:** `usage-core.ts → usage-store.ts` and `usage-core.ts → usage-schema.ts` only. At no intermediate commit may `usage-store.ts` import from `usage-core.ts`.

### Task 1: Characterization tests for uncovered idempotency replay paths
**Files:**
- Modify (test only): `/Users/yuri/Sites/auth/apps/api/integration/billing-usage.integration.ts` (insert after the existing test "replays reserve and commit results for the same idempotency key", line 165)

**Interfaces:** Consumes existing public exports `reserveBillingUsage`, `releaseBillingUsageReservation`, `createPolarEntitlementGrantStore`, `processPolarWebhook` and existing helpers `prepareBillingProject`, `credits`, `creditProduct`, `expectSummary`, `seedIntegrationRealm`, `polarOrderPaidPayload`. Produces no new interfaces.

The integration suite already covers reserve/commit replay of a *committed* reservation, grant-contention concurrency, expiry, resets, and reconcile. It does **not** cover: (a) replay of a *released* reservation (must come back `allowed: false` with the original id — the `replayBillingUsageReservation` status rule), (b) replay of a still-*pending* reservation, (c) the unique-violation race path where two concurrent reserves share an idempotency key (`isPostgresUniqueViolation` catch in `reserveBillingUsage`, lines 386–391). These are exactly the branches Tasks 3–4 will relocate, so pin them first.

- [ ] **Step 1: Write the characterization tests** (these must PASS against current code — they pin behavior; this replaces the failing-test step per the pure-move rule):
```ts
  test("replays a released reservation as not allowed for the same idempotency key", async () => {
    const project = await prepareBillingProject(credits(5));
    const input = {
      ...integrationAdminDbOptions,
      project,
      userId,
      key: benefitKey,
      amount: 2,
      idempotencyKey: "billing-replay-released-0001"
    };

    const first = await reserveBillingUsage(input);
    expect(first.allowed).toBe(true);
    await releaseBillingUsageReservation({
      ...integrationAdminDbOptions,
      project,
      userId,
      reservationId: first.reservationId ?? ""
    });

    const replayed = await reserveBillingUsage(input);

    expect(replayed.allowed).toBe(false);
    expect(replayed.reservationId).toBe(first.reservationId);
    await expectSummary(project, { used: 0, limit: 5, remaining: 5 });
  });

  test("replays a pending reservation without deducting credits twice", async () => {
    const project = await prepareBillingProject(credits(5));
    const input = {
      ...integrationAdminDbOptions,
      project,
      userId,
      key: benefitKey,
      amount: 2,
      idempotencyKey: "billing-replay-pending-0001"
    };

    const first = await reserveBillingUsage(input);
    const replayed = await reserveBillingUsage(input);

    expect(first.allowed).toBe(true);
    expect(replayed.allowed).toBe(true);
    expect(replayed.reservationId).toBe(first.reservationId);
    await expectSummary(project, { used: 2, limit: 5, remaining: 3 });
  });

  test("converges concurrent reserves sharing an idempotency key onto one reservation", async () => {
    const productId = "prod_integration_idempotent_race";
    const project = await seedIntegrationRealm({
      slug: "integration-billing",
      schema: "integration_billing_auth",
      name: "Integration Billing",
      freeEntitlements: [credits(5)],
      products: [
        creditProduct({ productId, entitlements: [credits(50)] })
      ]
    });
    await processPolarWebhook(
      {
        project,
        store: webhookStore,
        entitlements: createPolarEntitlementGrantStore(integrationAdminDbOptions)
      },
      polarOrderPaidPayload({
        orderId: "order_integration_idempotent_race",
        productId,
        userId
      })
    );
    const input = {
      ...integrationAdminDbOptions,
      project,
      userId,
      key: benefitKey,
      amount: 1,
      idempotencyKey: "billing-race-request-0001"
    };

    const [first, second] = await Promise.all([
      reserveBillingUsage(input),
      reserveBillingUsage(input)
    ]);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(second.reservationId).toBe(first.reservationId);
    await expectSummary(project, { used: 1, limit: 55, remaining: 54 });
  });
```
  Note on the race test: two grants exist on the same key (free 5 + purchased 50), so when the transactions overlap, `SKIP LOCKED` sends the loser to the second grant instead of failing with insufficient credits; the loser then hits the partial unique index `(project_slug, user_id, idempotency_key)` on insert, its whole transaction (including its decrement) rolls back, and the unique-violation catch replays the winner's reservation. Every interleaving (fully serial, overlapping) converges on: both allowed, one reservation id, `used: 1`. Do not write this test with a single grant — that would race into the insufficient-credits branch instead.
- [ ] **Step 2: Run the tests to verify they PASS against the current implementation** (characterization, not red-green):
  `cd /Users/yuri/Sites/auth && bun run test:integration:up && cd /Users/yuri/Sites/auth/apps/api && bun test ./integration/billing-usage.integration.ts`
  Expected: all tests pass, including the 3 new ones. If the race test flakes, that is a finding about current behavior — stop and investigate before refactoring (do not proceed with a flaky pin).
- [ ] **Step 3: No implementation** — this task is test-only. Also capture the export baseline:
  `cd /Users/yuri/Sites/auth/packages/domains/billing && bun -e 'const m = await import("./src/index.ts"); console.log(Object.keys(m).sort().join("\n"))' > /tmp/billing-exports-before.txt`
- [ ] **Step 4: Re-run to confirm stability** (run the integration file a second time to shake out ordering flakes):
  `cd /Users/yuri/Sites/auth/apps/api && bun test ./integration/billing-usage.integration.ts`
- [ ] **Step 5: Commit**
  `cd /Users/yuri/Sites/auth && git add apps/api/integration/billing-usage.integration.ts && git commit -m "test(billing): pin usage reservation idempotency replay behavior"`

### Task 2: Extract `usage-schema.ts` (DDL move)
**Files:**
- Create: `/Users/yuri/Sites/auth/packages/domains/billing/src/usage-schema.ts`
- Modify: `/Users/yuri/Sites/auth/packages/domains/billing/src/usage-store.ts` (delete lines 96–181), `/Users/yuri/Sites/auth/packages/domains/billing/src/bootstrap.ts` (line 4), `/Users/yuri/Sites/auth/packages/domains/billing/src/index.ts` (line 83 moves to a new export block)
- Test: existing `apps/api/integration/billing-usage.integration.ts` (every test calls `resetAndBootstrapIntegrationDatabase()` → `ensureBillingTables` → `ensureBillingUsageTables`, so DDL is fully pinned)

**Interfaces:** Produces `export const ensureBillingUsageTables = async (options: AdminDatabaseOptions): Promise<void>` in `usage-schema.ts` — body moved verbatim from usage-store.ts lines 96–181 (three `CREATE TABLE IF NOT EXISTS`, two `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, three index statements including the partial unique idempotency index). Consumes `withAdminDb`, `sql`.

- [ ] **Step 1: Pin with existing tests** (pure move — no new test). The behavior pin is the full integration file from Task 1; run it green before the move.
- [ ] **Step 2: Verify green before the move:**
  `cd /Users/yuri/Sites/auth/apps/api && bun test ./integration/billing-usage.integration.ts` — expected: pass.
- [ ] **Step 3: Perform the move.** New file:
```ts
// packages/domains/billing/src/usage-schema.ts
import {
  withAdminDb,
  type AdminDatabaseOptions
} from "@nezdemkovski/auth-platform-database";
import { sql } from "drizzle-orm";

export const ensureBillingUsageTables = async (options: AdminDatabaseOptions) => {
  await withAdminDb(options, async ({ db }) => {
    // lines 98–179 of the old usage-store.ts, byte-for-byte:
    // CREATE TABLE auth_billing_entitlement_grants …
    // ALTER TABLE … ADD COLUMN IF NOT EXISTS reset_at …
    // CREATE INDEX auth_billing_entitlement_grants_lookup_idx …
    // CREATE TABLE auth_billing_usage_events …
    // CREATE TABLE auth_billing_usage_reservations …
    // ALTER TABLE … ADD COLUMN IF NOT EXISTS idempotency_key …
    // CREATE UNIQUE INDEX auth_billing_usage_reservations_idempotency_key … WHERE idempotency_key IS NOT NULL
    // CREATE INDEX auth_billing_usage_reservations_pending_idx …
  });
};
```
  Delete the function from `usage-store.ts`. Update `bootstrap.ts`:
```ts
import { ensureBillingUsageTables } from "./usage-schema";
```
  Update `index.ts`: remove `ensureBillingUsageTables` from the `"./usage-store"` block and add:
```ts
export { ensureBillingUsageTables } from "./usage-schema";
```
- [ ] **Step 4: Verify green after the move:**
  `cd /Users/yuri/Sites/auth && bun run typecheck && bun run test && cd packages/domains/billing && bun run build && cd /Users/yuri/Sites/auth/apps/api && bun test ./integration/billing-usage.integration.ts`
  Also diff the export surface:
  `cd /Users/yuri/Sites/auth/packages/domains/billing && bun -e 'const m = await import("./src/index.ts"); console.log(Object.keys(m).sort().join("\n"))' | diff /tmp/billing-exports-before.txt -` — expected: empty diff.
- [ ] **Step 5: Commit**
  `cd /Users/yuri/Sites/auth && git add packages/domains/billing/src/usage-schema.ts packages/domains/billing/src/usage-store.ts packages/domains/billing/src/bootstrap.ts packages/domains/billing/src/index.ts && git commit -m "refactor(billing): extract usage table DDL into usage-schema"`

### Task 3: Extract reservation/summary persistence primitives in place
**Files:**
- Modify: `/Users/yuri/Sites/auth/packages/domains/billing/src/usage-store.ts` only (no other file changes; no export changes visible outside the package)
- Test: existing integration file (all reservation, commit, release, expiry, reset, concurrency, and Task 1 idempotency tests)

**Interfaces:** Adds these exported persistence primitives to `usage-store.ts` (SQL bodies moved verbatim from the current business functions; each primitive is one statement or one read):
```ts
export type BillingUsageDb = AdminDatabase["db"];
export type BillingUsageTransaction = NodePgTransaction<AnyRelations>; // already exists as a private type — export it

export type GrantConsumption = { id: string; amount: number | null };          // exists — export it
export type UsageReservationRow = {                                            // rename of ReservationRow — export it
  id: string; benefitKey: string; amount: number;
  grantConsumptions: unknown; expiresAt: Date;
};
export type UsageSummaryRow = { limit: number | null; remaining: number | null; unlimited: boolean };

export const withUsageDb = <T>(options: AdminDatabaseOptions, operation: (db: BillingUsageDb) => Promise<T>): Promise<T> =>
  withAdminDb(options, ({ db }) => operation(db));
export const withUsageTransaction = <T>(db: BillingUsageDb, operation: (tx: BillingUsageTransaction) => Promise<T>): Promise<T> =>
  db.transaction(operation);

export const findIdempotentReservation: (db: BillingUsageDb, options: { project: BillingRealm; userId: string; idempotencyKey?: string }) => Promise<{ id: string; status: string } | null>; // exists (lines 486–514) — export unchanged
export const selectActiveUnlimitedGrant: (tx: BillingUsageTransaction, input: { projectSlug: string; userId: string; key: string }) => Promise<{ id: string } | null>;                     // from reserve lines 299–313
export const lockNextConsumableGrant: (tx: BillingUsageTransaction, input: { projectSlug: string; userId: string; key: string }) => Promise<{ id: string; remaining: number | null } | null>; // from reserve lines 323–341 (.for("update", { skipLocked: true }))
export const decrementGrantRemaining: (tx: BillingUsageTransaction, grantId: string, amount: number) => Promise<void>;   // from reserve lines 347–353
export const insertUsageReservation: (tx: BillingUsageTransaction, values: { id: string; projectSlug: string; userId: string; benefitKey: string; amount: number; idempotencyKey: string | null; grantConsumptions: GrantConsumption[]; ttlSeconds: number }) => Promise<void>; // from reserve lines 361–371, status Pending, expiresAt sql`now() + (${values.ttlSeconds}::int * interval '1 second')`
export const lockCommittableReservation: (tx: BillingUsageTransaction, input: { reservationId: string; projectSlug: string; userId: string }) => Promise<(UsageReservationRow & { status: string }) | null>; // from commit lines 413–435 (status IN (Pending, Committed), .for("update"))
export const lockPendingReservation: (tx: BillingUsageTransaction, input: { reservationId: string; projectSlug: string; userId: string }) => Promise<UsageReservationRow | null>;             // from release lines 544–562 (status = Pending, .for("update"))
export const lockExpiredPendingReservations: (tx: BillingUsageTransaction, input: { projectSlug: string; userId?: string; key?: string }) => Promise<UsageReservationRow[]>;                  // from sweep lines 742–764 (.for("update", { skipLocked: true }))
export const insertUsageEvent: (tx: BillingUsageTransaction, values: { projectSlug: string; userId: string; benefitKey: string; amount: number; grantIds: string[] }) => Promise<void>;        // from commit lines 451–458 (id: randomBase64Url(24) generated inside)
export const updateReservationStatus: (tx: BillingUsageTransaction, reservationId: string, status: BillingUsageReservationStatus) => Promise<void>;                                            // from lines 459–465 / 798–804
export const restoreGrantRemaining: (tx: BillingUsageTransaction, grantId: string, amount: number) => Promise<void>;      // from releaseReservation lines 789–795 (remaining = remaining + amount)
export const readGrantUsageSummaryRow: (options: AdminDatabaseOptions & { projectSlug: string; userId: string; key: string }) => Promise<UsageSummaryRow | undefined>;                        // aggregate select from readBillingUsageSummary lines 216–233
export const resetDueRecurringGrants: (options: AdminDatabaseOptions & { projectSlug: string; userId: string; key?: string }) => Promise<void>;                                                // whole body of resetDueBillingEntitlements lines 663–700 (CASE reset SQL verbatim)
export const parseGrantConsumptions: (value: unknown) => GrantConsumption[];   // exists (lines 807–829) — export unchanged
```
The business functions (`readBillingUsageSummary`, `reserveBillingUsage`, `commitBillingUsageReservation`, `releaseBillingUsageReservation`, `releaseExpiredBillingUsageReservations`, `releaseReservation`) are rewritten **in this same file** to call the primitives; their `withAdminDb`/`db.transaction` skeletons are replaced 1:1 by `withUsageDb`/`withUsageTransaction` so boundaries are unchanged. Example (reserve, showing the delegation — control flow identical to lines 278–399):
```ts
return withUsageDb(options, async (db) => {
  if (options.idempotencyKey) {
    const existing = await findIdempotentReservation(db, options);
    if (existing) {
      return replayBillingUsageReservation(options, existing);
    }
  }

  const reservationId = randomBase64Url(24);
  let transactionResult: { allowed: true; reservationId: string };
  try {
    transactionResult = await withUsageTransaction(db, async (tx): Promise<{ allowed: true; reservationId: string }> => {
      const grantConsumptions: GrantConsumption[] = [];
      let remainingAmount = options.amount;

      const unlimitedGrant = await selectActiveUnlimitedGrant(tx, {
        projectSlug: options.project.slug,
        userId: options.userId,
        key: options.key
      });
      if (unlimitedGrant) {
        grantConsumptions.push({ id: unlimitedGrant.id, amount: null });
        remainingAmount = 0;
      }

      while (remainingAmount > 0) {
        const grant = await lockNextConsumableGrant(tx, {
          projectSlug: options.project.slug,
          userId: options.userId,
          key: options.key
        });
        if (!grant) {
          throw new InsufficientBillingUsageError();
        }

        const consumed = Math.min(grant.remaining ?? 0, remainingAmount);
        await decrementGrantRemaining(tx, grant.id, consumed);
        grantConsumptions.push({ id: grant.id, amount: consumed });
        remainingAmount -= consumed;
      }

      await insertUsageReservation(tx, {
        id: reservationId,
        projectSlug: options.project.slug,
        userId: options.userId,
        benefitKey: options.key,
        amount: options.amount,
        idempotencyKey: options.idempotencyKey ?? null,
        grantConsumptions,
        ttlSeconds: options.ttlSeconds ?? 900
      });

      return { allowed: true, reservationId };
    });
  } catch (error) {
    if (error instanceof InsufficientBillingUsageError) {
      return { allowed: false, reservationId: null, summary: await readBillingUsageSummary(options) };
    }
    if (options.idempotencyKey && isPostgresUniqueViolation(error)) {
      const existing = await findIdempotentReservation(db, options);
      if (existing) {
        return replayBillingUsageReservation(options, existing);
      }
    }
    throw error;
  }

  return { ...transactionResult, summary: await readBillingUsageSummary(options) };
});
```
`releaseReservation` becomes:
```ts
const releaseReservation = async (
  tx: BillingUsageTransaction,
  reservation: UsageReservationRow,
  status: BillingUsageReservationStatus.Released | BillingUsageReservationStatus.Expired
) => {
  for (const consumption of parseGrantConsumptions(reservation.grantConsumptions)) {
    if (consumption.amount === null) {
      continue;
    }
    await restoreGrantRemaining(tx, consumption.id, consumption.amount);
  }
  await updateReservationStatus(tx, reservation.id, status);
};
```
`resetDueBillingEntitlements` is deleted; its two call sites (`readBillingUsageSummary`, `reserveBillingUsage`) call `resetDueRecurringGrants({ ...options, projectSlug: options.project.slug, userId: options.userId, key: options.key })` directly. `ensureFreeEntitlementGrants` and the grant/deactivate functions are untouched in this task.

- [ ] **Step 1: Pin with existing tests** (pure refactor — Task 1 tests plus the whole integration file are the spec; the concurrency test at line 517 and the new race test pin `SKIP LOCKED` and unique-violation semantics).
- [ ] **Step 2: Verify green before:** `cd /Users/yuri/Sites/auth/apps/api && bun test ./integration/billing-usage.integration.ts` — expected: pass.
- [ ] **Step 3: Implement the primitives and rewrite the business functions in place** as specified above. Rules: each primitive's SQL/Drizzle call chain is copied byte-for-byte from the lines noted (only substituting `input.projectSlug` for `options.project.slug` etc.); no primitive contains a branch that decides *whether* to run (decisions stay in the callers); `.for("update")`, `.for("update", { skipLocked: true })`, `.limit(1)`, ordering, and status filters stay attached to the same statements.
- [ ] **Step 4: Verify green after:**
  `cd /Users/yuri/Sites/auth && bun run typecheck && bun run test && cd packages/domains/billing && bun run build && cd /Users/yuri/Sites/auth/apps/api && bun test ./integration/billing-usage.integration.ts` — expected: pass. Export-surface diff (same command as Task 2 Step 4): empty.
- [ ] **Step 5: Commit**
  `cd /Users/yuri/Sites/auth && git add packages/domains/billing/src/usage-store.ts && git commit -m "refactor(billing): extract usage persistence primitives in usage-store"`

### Task 4: Move the quota business cluster into `usage-core.ts`
**Files:**
- Modify: `/Users/yuri/Sites/auth/packages/domains/billing/src/usage-core.ts` (gains ~230 lines), `/Users/yuri/Sites/auth/packages/domains/billing/src/usage-store.ts` (loses the same functions; temporarily exports `ensureFreeEntitlementGrants`), `/Users/yuri/Sites/auth/packages/domains/billing/src/index.ts` (re-point 6 names to `"./usage-core"`)
- Test: existing integration file + `packages/domains/billing/src/__tests__/usage-core.test.ts`

**Interfaces:** These move verbatim (post-Task-3 thin versions) from `usage-store.ts` to `usage-core.ts`, keeping exact signatures:
```ts
export type BillingUsageReservationResult = { allowed: boolean; reservationId: string | null; summary: BillingUsageSummary };
export const readBillingUsageSummary: (options: AdminDatabaseOptions & { project: BillingRealm; userId: string; key: string }) => Promise<BillingUsageSummary>;
export const consumeBillingUsage: (options: AdminDatabaseOptions & { project: BillingRealm; userId: string; key: string; amount: number; idempotencyKey?: string }) => Promise<{ allowed: boolean; summary: BillingUsageSummary }>;
export const reserveBillingUsage: (options: AdminDatabaseOptions & { project: BillingRealm; userId: string; key: string; amount: number; ttlSeconds?: number; idempotencyKey?: string }) => Promise<BillingUsageReservationResult>;
export const commitBillingUsageReservation: (options: AdminDatabaseOptions & { project: BillingRealm; userId: string; reservationId: string }) => Promise<{ allowed: true; summary: BillingUsageSummary } | null>;
export const releaseBillingUsageReservation: (options: AdminDatabaseOptions & { project: BillingRealm; userId: string; reservationId: string }) => Promise<{ released: true; summary: BillingUsageSummary } | null>;
```
Private movers: `InsufficientBillingUsageError`, `replayBillingUsageReservation`, `releaseExpiredBillingUsageReservations`, `releaseReservation` (rename to `releaseReservationConsumptions`), `usageSummary` (lines 985–997), `grantIds` (reimplemented as `parseGrantConsumptions(value).map((c) => c.id)` in core). Consumes from `usage-store.ts`: everything listed in Task 3 plus `BillingUsageReservationStatus`, plus a **temporary** `export` on `ensureFreeEntitlementGrants` (still store-resident until Task 5). Consumes `randomBase64Url` (add import from `@nezdemkovski/auth-platform-crypto`) and `isPostgresUniqueViolation` (add import from `@nezdemkovski/auth-platform-database`).

- [ ] **Step 1: Pin with existing tests** (pure cut-paste move). The pins: full integration file (all quota paths) + `usage-core.test.ts` (which exercises `mutateBillingUsage` delegating to these functions — its `Awaited<ReturnType<typeof consumeBillingUsage>>` result types now resolve against local definitions).
- [ ] **Step 2: Verify green before:** `cd /Users/yuri/Sites/auth/packages/domains/billing && bun test && cd /Users/yuri/Sites/auth/apps/api && bun test ./integration/billing-usage.integration.ts` — expected: pass.
- [ ] **Step 3: Perform the move.**
  1. In `usage-core.ts`, delete the import block `import { commitBillingUsageReservation, consumeBillingUsage, readBillingUsageSummary, releaseBillingUsageReservation, reserveBillingUsage } from "./usage-store";` and paste the six moved functions + private helpers, importing primitives instead:
```ts
import { randomBase64Url } from "@nezdemkovski/auth-platform-crypto";
import {
  isPostgresUniqueViolation,
  type AdminDatabaseOptions
} from "@nezdemkovski/auth-platform-database";

import {
  BillingUsageReservationStatus,
  decrementGrantRemaining,
  ensureFreeEntitlementGrants,
  findIdempotentReservation,
  insertUsageEvent,
  insertUsageReservation,
  lockCommittableReservation,
  lockExpiredPendingReservations,
  lockNextConsumableGrant,
  lockPendingReservation,
  parseGrantConsumptions,
  readGrantUsageSummaryRow,
  resetDueRecurringGrants,
  restoreGrantRemaining,
  selectActiveUnlimitedGrant,
  updateReservationStatus,
  withUsageDb,
  withUsageTransaction,
  type BillingUsageTransaction,
  type GrantConsumption,
  type UsageReservationRow,
  type UsageSummaryRow
} from "./usage-store";
```
  2. In `usage-store.ts`, add `export` to `ensureFreeEntitlementGrants` (temporary, removed in Task 5) and delete the moved functions/types. Keep `BillingUsageReservationStatus`, `BillingEntitlementSourceType`, `deactivateBillingEntitlementSource`, `deactivateBillingSubscriptionEntitlements`, `grantBillingProductEntitlements`, `createPolarEntitlementGrantStore`, `ensureFreeEntitlementGrants`, `grantEntitlements`, `initialResetAt`, `initialRemaining` and all primitives.
  3. In `index.ts`, move `commitBillingUsageReservation`, `consumeBillingUsage`, `readBillingUsageSummary`, `releaseBillingUsageReservation`, `reserveBillingUsage`, `type BillingUsageReservationResult` from the `"./usage-store"` block into the `"./usage-core"` block (which already exports `mutateBillingUsage` etc.). Names unchanged.
- [ ] **Step 4: Verify green after:**
  `cd /Users/yuri/Sites/auth && bun run typecheck && bun run test && cd packages/domains/billing && bun run build && cd /Users/yuri/Sites/auth/apps/api && bun test ./integration/billing-usage.integration.ts` — expected: pass. Export-surface diff: empty. Also verify no back-edge: `grep -n "usage-core" /Users/yuri/Sites/auth/packages/domains/billing/src/usage-store.ts` — expected: no matches.
- [ ] **Step 5: Commit**
  `cd /Users/yuri/Sites/auth && git add packages/domains/billing/src/usage-core.ts packages/domains/billing/src/usage-store.ts packages/domains/billing/src/index.ts && git commit -m "refactor(billing): move quota reservation business rules into usage-core"`

### Task 5: Move entitlement-grant business rules into `usage-core.ts`
**Files:**
- Modify: `/Users/yuri/Sites/auth/packages/domains/billing/src/usage-core.ts`, `/Users/yuri/Sites/auth/packages/domains/billing/src/usage-store.ts`, `/Users/yuri/Sites/auth/packages/domains/billing/src/index.ts`, `/Users/yuri/Sites/auth/packages/domains/billing/src/webhooks.ts` (import lines 7–10 only)
- Test: existing integration tests "grants paid Polar order entitlements once and removes them after refund", "reconciles changed signup grants without refunding spent credits", "deactivates free grants removed from billing settings", "grants signup credits lazily and stacks paid credit packs", "does not grant entitlements for inactive product mappings", "resets recurring quota after its persisted reset boundary", plus `webhooks.test.ts`

**Interfaces:** Store keeps/gains persistence primitives:
```ts
// usage-store.ts — new primitives (SQL verbatim from grantEntitlements lines 898–955 and ensureFreeEntitlementGrants lines 636–660)
export type EntitlementGrantUpsert = {
  id: string;
  projectSlug: string;
  userId: string;
  benefitKey: string;
  grantType: EntitlementGrantType;
  amount: number | null;
  remaining: number | null;
  resetPeriod: EntitlementResetPeriod;
  resetAt: Date | null;
  priority: number;
  sourceType: BillingEntitlementSourceType;
  sourceId: string;
  productSlug: string | null;
  metadata: unknown;
};

export const upsertEntitlementGrants = async (
  options: AdminDatabaseOptions & {
    grants: EntitlementGrantUpsert[];
    reconcileExisting: boolean;
  }
): Promise<void> => {
  await withUsageDb(options, async (db) => {
    for (const values of options.grants) {
      const insert = db.insert(billingEntitlementGrants).values(values);
      if (!options.reconcileExisting) {
        await insert.onConflictDoNothing();
        continue;
      }
      await insert.onConflictDoUpdate({
        // target, set (remaining CASE, resetAt CASE), setWhere — byte-for-byte from lines 907–955
      });
    }
  });
};

export const deactivateFreeGrantsOutsideKeys = async (
  options: AdminDatabaseOptions & {
    projectSlug: string;
    userId: string;
    desiredKeys: string[];
  }
): Promise<void> => { /* UPDATE from lines 638–659 verbatim, incl. the
  desiredKeys.length > 0 ? notInArray(...) : undefined condition and
  sourceType = Free, sourceId = "default" filters */ };
```
The loop stays inside **one** `withUsageDb` call — `withAdminDb` creates a fresh pool per invocation when `options.adminDb` is absent, so per-row store calls would change pooling behavior. Core gains (moved from store):
```ts
// usage-core.ts
export type PolarEntitlementGrantStore = { /* unchanged shape, lines 47–66 */ };
export const createPolarEntitlementGrantStore = (options: AdminDatabaseOptions): PolarEntitlementGrantStore => ({
  grantProductEntitlements: (input) => grantBillingProductEntitlements({ ...options, ...input }),
  deactivateSource: (input) => deactivateBillingEntitlementSource({ ...options, ...input }),
  deactivateSubscription: (input) => deactivateBillingSubscriptionEntitlements({ ...options, ...input })
});
export const grantBillingProductEntitlements: (options: AdminDatabaseOptions & { project: BillingRealm; userId: string; productId: string; sourceId: string; metadata: unknown }) => Promise<number>;
// body unchanged (lines 589–615): active-product lookup decision + grantEntitlements call

const grantEntitlements = async (options: AdminDatabaseOptions & {
  project: BillingRealm; userId: string; product: BillingProductMapping | null;
  entitlements: BillingEntitlement[]; sourceType: BillingEntitlementSourceType;
  sourceId: string; metadata: unknown; reconcileExisting?: boolean;
}) => {
  await upsertEntitlementGrants({
    databaseUrl: options.databaseUrl,
    adminProject: options.adminProject,
    adminDb: options.adminDb,
    reconcileExisting: options.reconcileExisting === true,
    grants: options.entitlements.map((entitlement) => ({
      id: randomBase64Url(24),
      projectSlug: options.project.slug,
      userId: options.userId,
      benefitKey: entitlement.key,
      grantType: entitlement.grantType,
      amount: entitlement.amount,
      remaining: initialRemaining(entitlement),
      resetPeriod: entitlement.resetPeriod,
      resetAt: initialResetAt(entitlement),
      priority: entitlement.priority,
      sourceType: options.sourceType,
      sourceId: options.sourceId,
      productSlug: options.product?.slug ?? null,
      metadata: options.metadata
    }))
  });
};
// initialResetAt (lines 960–972) and initialRemaining (lines 974–983) move verbatim — pure business calculations.
// ensureFreeEntitlementGrants moves: grantEntitlements(...) call + deactivateFreeGrantsOutsideKeys({ ..., desiredKeys }) call; the temporary store export from Task 4 is removed.
```
`deactivateBillingEntitlementSource` and `deactivateBillingSubscriptionEntitlements` are already pure persistence — they **stay in `usage-store.ts`** unchanged, still exported from index via `"./usage-store"`. The enums `BillingUsageReservationStatus` / `BillingEntitlementSourceType` stay in `usage-store.ts` (persisted-state vocabulary; keeps `webhooks.ts` line 8 and both index export lines unchanged). `webhooks.ts` changes only its type import:
```ts
import { BillingEntitlementSourceType } from "./usage-store";
import type { PolarEntitlementGrantStore } from "./usage-core";
```
`index.ts` moves `createPolarEntitlementGrantStore`, `grantBillingProductEntitlements`, `type PolarEntitlementGrantStore` into the `"./usage-core"` block.

- [ ] **Step 1: Pin with existing tests** (pure move + primitive extraction). The reconcile `CASE`/`setWhere` semantics are pinned by "reconciles changed signup grants without refunding spent credits" (increase 5→10 keeps `used: 2`; decrease to 1 clamps `remaining` to 0) and "deactivates free grants removed from billing settings"; the once-only grant is pinned by "grants paid Polar order entitlements once…" (duplicate webhook, `onConflictDoNothing`).
- [ ] **Step 2: Verify green before:** `cd /Users/yuri/Sites/auth/apps/api && bun test ./integration/billing-usage.integration.ts && cd /Users/yuri/Sites/auth/packages/domains/billing && bun test` — expected: pass.
- [ ] **Step 3: Perform the move** as specified in Interfaces: add the two store primitives (SQL byte-for-byte), move the five business items to core, delete the temporary `ensureFreeEntitlementGrants` export/definition from store, update `webhooks.ts` and `index.ts` imports.
- [ ] **Step 4: Verify green after:**
  `cd /Users/yuri/Sites/auth && bun run typecheck && bun run test && cd packages/domains/billing && bun run build && cd /Users/yuri/Sites/auth/apps/api && bun test ./integration/billing-usage.integration.ts` — expected: pass. Export-surface diff: empty. Back-edge check: `grep -n "usage-core" /Users/yuri/Sites/auth/packages/domains/billing/src/usage-store.ts` — no matches.
- [ ] **Step 5: Commit**
  `cd /Users/yuri/Sites/auth && git add packages/domains/billing/src/usage-core.ts packages/domains/billing/src/usage-store.ts packages/domains/billing/src/index.ts packages/domains/billing/src/webhooks.ts && git commit -m "refactor(billing): move entitlement grant business rules into usage-core"`

### Task 6: Full-suite verification and layering audit
**Files:**
- No source changes expected. Read/verify: `/Users/yuri/Sites/auth/packages/domains/billing/src/usage-store.ts`, `usage-core.ts`, `usage-schema.ts`, `index.ts`
- Test: entire repo suite + full integration suite

**Interfaces:** None produced. Verifies the final shape: `usage-schema.ts` ≈ 95 lines (DDL only); `usage-store.ts` ≈ 420 lines (enums, row types, `withUsageDb`/`withUsageTransaction`, ~17 single-purpose persistence functions, `deactivateBillingEntitlementSource`/`deactivateBillingSubscriptionEntitlements`, `parseGrantConsumptions`); `usage-core.ts` ≈ 480 lines (all reservation/commit/release/replay/sweep/grant/summary business rules + existing `mutateBillingUsage` API).

- [ ] **Step 1: Layering audit (the "test" for this task).** Verify store contains no business decisions and core contains no SQL:
  `grep -nE "billing\.products|freeEntitlements|Math\.min|instanceof|ttlSeconds \?\?|grantType ===" /Users/yuri/Sites/auth/packages/domains/billing/src/usage-store.ts` — expected: no matches (no product selection, no consumption math, no error-type branching, no TTL defaulting in store).
  `grep -nE "billingEntitlementGrants|billingUsageReservations|billingUsageEvents|drizzle-orm" /Users/yuri/Sites/auth/packages/domains/billing/src/usage-core.ts` — expected: no matches (no table objects or drizzle imports in core).
- [ ] **Step 2: Run the audit greps and record results.** If either grep matches, treat it as a failing test: relocate the offending line per the Task 3–5 patterns before proceeding.
- [ ] **Step 3: No new implementation** — verify the export surface one final time:
  `cd /Users/yuri/Sites/auth/packages/domains/billing && bun -e 'const m = await import("./src/index.ts"); console.log(Object.keys(m).sort().join("\n"))' | diff /tmp/billing-exports-before.txt -` — expected: empty. Also `wc -l /Users/yuri/Sites/auth/packages/domains/billing/src/usage-*.ts` — expected: no file near 997 lines; `usage-store.ts` well under 500.
- [ ] **Step 4: Run everything:**
  `cd /Users/yuri/Sites/auth && bun run typecheck && bun run test && bun run test:integration:up && bun run test:integration` — expected: all green, including `turbo boundaries` (runs inside `bun run test`). Run the billing-usage integration file twice to confirm the Task 1 race test remains stable.
- [ ] **Step 5: Commit** — only if Step 2 forced fixes; otherwise nothing to commit:
  `cd /Users/yuri/Sites/auth && git add packages/domains/billing/src && git commit -m "refactor(billing): finish usage store layering split"` (skip if `git status` is clean).

### Critical Files for Implementation
- /Users/yuri/Sites/auth/packages/domains/billing/src/usage-store.ts
- /Users/yuri/Sites/auth/packages/domains/billing/src/usage-core.ts
- /Users/yuri/Sites/auth/packages/domains/billing/src/index.ts
- /Users/yuri/Sites/auth/apps/api/integration/billing-usage.integration.ts
- /Users/yuri/Sites/auth/packages/domains/billing/src/webhooks.ts
