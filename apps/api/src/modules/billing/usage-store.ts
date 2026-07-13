import { and, eq, gt, inArray, isNull, lt, notInArray, sql } from "drizzle-orm";
import type { BillingUsageSummary } from "@nezdemkovski/auth-contracts";
import type { NodePgTransaction } from "drizzle-orm/node-postgres";
import type { AnyRelations } from "drizzle-orm/relations";

import {
  EntitlementGrantType,
  EntitlementResetPeriod,
  type AuthProject,
  type BillingEntitlement,
  type BillingProductMapping
} from "../../config/projects";
import type { AdminDatabase, AdminDatabaseOptions } from "../../db/admin-pool";
import { withAdminDb } from "../../db/admin-pool";
import { isPostgresUniqueViolation } from "../../db/errors";
import { randomBase64Url } from "../../runtime/crypto";
import { isRecord } from "../../runtime/type-guards";
import {
  billingEntitlementGrants,
  billingUsageEvents,
  billingUsageReservations
} from "./tables";

export type { BillingUsageSummary } from "@nezdemkovski/auth-contracts";

export enum BillingUsageReservationStatus {
  Pending = "pending",
  Committed = "committed",
  Released = "released",
  Expired = "expired"
}

export enum BillingEntitlementSourceType {
  Free = "free",
  PolarOrder = "polar_order"
}

export type BillingUsageReservationResult = {
  allowed: boolean;
  reservationId: string | null;
  summary: BillingUsageSummary;
};

export type PolarEntitlementGrantStore = {
  grantProductEntitlements(input: {
    project: AuthProject;
    userId: string;
    productId: string;
    sourceId: string;
    metadata: unknown;
  }): Promise<number>;
  deactivateSource(input: {
    project: AuthProject;
    sourceType: string;
    sourceId: string;
    metadata: unknown;
  }): Promise<number>;
  deactivateSubscription(input: {
    project: AuthProject;
    subscriptionId: string;
    metadata: unknown;
  }): Promise<number>;
};

type ReservationRow = {
  id: string;
  benefitKey: string;
  amount: number;
  grantConsumptions: unknown;
  expiresAt: Date;
};

type SummaryRow = {
  limit: number | null;
  remaining: number | null;
  unlimited: boolean;
};

type GrantConsumption = {
  id: string;
  amount: number | null;
};

class InsufficientBillingUsageError extends Error {
  constructor() {
    super("insufficient_billing_usage");
    this.name = "InsufficientBillingUsageError";
  }
}

type BillingUsageTransaction = NodePgTransaction<AnyRelations>;

export const ensureBillingUsageTables = async (options: AdminDatabaseOptions) => {
  await withAdminDb(options, async ({ db }) => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS auth_billing_entitlement_grants (
        id text PRIMARY KEY,
        project_slug text NOT NULL REFERENCES auth_project_settings(slug) ON DELETE CASCADE,
        user_id text NOT NULL,
        benefit_key text NOT NULL,
        grant_type text NOT NULL,
        amount integer,
        remaining integer,
        reset_period text NOT NULL,
        reset_at timestamptz,
        priority integer NOT NULL DEFAULT 100,
        source_type text NOT NULL,
        source_id text NOT NULL,
        product_slug text,
        active boolean NOT NULL DEFAULT true,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (project_slug, user_id, benefit_key, source_type, source_id)
      )
    `);
    await db.execute(sql`
      ALTER TABLE auth_billing_entitlement_grants
      ADD COLUMN IF NOT EXISTS reset_at timestamptz
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS auth_billing_entitlement_grants_lookup_idx
      ON auth_billing_entitlement_grants (
        project_slug,
        user_id,
        benefit_key,
        active,
        priority,
        created_at
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS auth_billing_usage_events (
        id text PRIMARY KEY,
        project_slug text NOT NULL REFERENCES auth_project_settings(slug) ON DELETE CASCADE,
        user_id text NOT NULL,
        benefit_key text NOT NULL,
        amount integer NOT NULL,
        grant_ids jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS auth_billing_usage_reservations (
        id text PRIMARY KEY,
        project_slug text NOT NULL REFERENCES auth_project_settings(slug) ON DELETE CASCADE,
        user_id text NOT NULL,
        benefit_key text NOT NULL,
        amount integer NOT NULL,
        idempotency_key text,
        grant_consumptions jsonb NOT NULL,
        status text NOT NULL,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      ALTER TABLE auth_billing_usage_reservations
      ADD COLUMN IF NOT EXISTS idempotency_key text
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS auth_billing_usage_reservations_idempotency_key
      ON auth_billing_usage_reservations (project_slug, user_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS auth_billing_usage_reservations_pending_idx
      ON auth_billing_usage_reservations (
        project_slug,
        user_id,
        benefit_key,
        status,
        expires_at
      )
    `);
  });
};

export const createPolarEntitlementGrantStore = (
  options: AdminDatabaseOptions
): PolarEntitlementGrantStore => {
  return {
    grantProductEntitlements: (input) =>
      grantBillingProductEntitlements({
        ...options,
        ...input
      }),
    deactivateSource: (input) =>
      deactivateBillingEntitlementSource({
        ...options,
        ...input
      }),
    deactivateSubscription: (input) =>
      deactivateBillingSubscriptionEntitlements({
        ...options,
        ...input
      })
  };
};

export const readBillingUsageSummary = async (
  options: AdminDatabaseOptions & {
    project: AuthProject;
    userId: string;
    key: string;
  }
) => {
  await releaseExpiredBillingUsageReservations(options);
  await ensureFreeEntitlementGrants(options);
  await resetDueBillingEntitlements(options);

  return withAdminDb(options, async ({ db }) => {
    const rows = await db
      .select({
        limit: sql<number>`COALESCE(SUM(${billingEntitlementGrants.amount}) FILTER (WHERE ${billingEntitlementGrants.amount} IS NOT NULL), 0)::int`,
        remaining: sql<number>`COALESCE(SUM(${billingEntitlementGrants.remaining}) FILTER (WHERE ${billingEntitlementGrants.remaining} IS NOT NULL), 0)::int`,
        unlimited: sql<boolean>`BOOL_OR(${billingEntitlementGrants.amount} IS NULL)`
      })
      .from(billingEntitlementGrants)
      .where(
        and(
          eq(billingEntitlementGrants.projectSlug, options.project.slug),
          eq(billingEntitlementGrants.userId, options.userId),
          eq(billingEntitlementGrants.benefitKey, options.key),
          eq(billingEntitlementGrants.active, true)
        )
      );

    return usageSummary(options.key, rows[0]);
  });
};

export const consumeBillingUsage = async (
  options: AdminDatabaseOptions & {
    project: AuthProject;
    userId: string;
    key: string;
    amount: number;
    idempotencyKey?: string;
  }
) => {
  const reservation = await reserveBillingUsage(options);
  if (!reservation.allowed || !reservation.reservationId) {
    return {
      allowed: false,
      summary: reservation.summary
    };
  }

  const committed = await commitBillingUsageReservation({
    ...options,
    reservationId: reservation.reservationId
  });
  return committed ?? {
    allowed: false,
    summary: await readBillingUsageSummary(options)
  };
};

export const reserveBillingUsage = async (
  options: AdminDatabaseOptions & {
    project: AuthProject;
    userId: string;
    key: string;
    amount: number;
    ttlSeconds?: number;
    idempotencyKey?: string;
  }
): Promise<BillingUsageReservationResult> => {
  await releaseExpiredBillingUsageReservations(options);
  await ensureFreeEntitlementGrants(options);
  await resetDueBillingEntitlements(options);

  return withAdminDb(options, async ({ db }) => {
    if (options.idempotencyKey) {
      const existing = await findIdempotentReservation(db, options);
      if (existing) {
        return replayBillingUsageReservation(options, existing);
      }
    }

    const reservationId = randomBase64Url(24);
    let transactionResult: {
      allowed: true;
      reservationId: string;
    };
    try {
      transactionResult = await db.transaction(async (tx): Promise<{
        allowed: true;
        reservationId: string;
      }> => {
        const grantConsumptions: GrantConsumption[] = [];
        let remainingAmount = options.amount;

        const unlimitedGrants = await tx
          .select({ id: billingEntitlementGrants.id })
          .from(billingEntitlementGrants)
          .where(
            and(
              eq(billingEntitlementGrants.projectSlug, options.project.slug),
              eq(billingEntitlementGrants.userId, options.userId),
              eq(billingEntitlementGrants.benefitKey, options.key),
              eq(billingEntitlementGrants.active, true),
              isNull(billingEntitlementGrants.amount)
            )
          )
          .orderBy(billingEntitlementGrants.priority, billingEntitlementGrants.createdAt)
          .limit(1);
        const unlimitedGrant = unlimitedGrants[0];
        if (unlimitedGrant) {
          grantConsumptions.push({
            id: unlimitedGrant.id,
            amount: null
          });
          remainingAmount = 0;
        }

        while (remainingAmount > 0) {
          const grants = await tx
            .select({
              id: billingEntitlementGrants.id,
              remaining: billingEntitlementGrants.remaining
            })
            .from(billingEntitlementGrants)
            .where(
              and(
                eq(billingEntitlementGrants.projectSlug, options.project.slug),
                eq(billingEntitlementGrants.userId, options.userId),
                eq(billingEntitlementGrants.benefitKey, options.key),
                eq(billingEntitlementGrants.active, true),
                gt(billingEntitlementGrants.remaining, 0)
              )
            )
            .orderBy(billingEntitlementGrants.priority, billingEntitlementGrants.createdAt)
            .limit(1)
            .for("update", { skipLocked: true });
          const grant = grants[0];
          if (!grant) {
            throw new InsufficientBillingUsageError();
          }

          const consumed = Math.min(grant.remaining ?? 0, remainingAmount);
          await tx
            .update(billingEntitlementGrants)
            .set({
              remaining: sql`${billingEntitlementGrants.remaining} - ${consumed}`,
              updatedAt: sql`now()`
            })
            .where(eq(billingEntitlementGrants.id, grant.id));
          grantConsumptions.push({
            id: grant.id,
            amount: consumed
          });
          remainingAmount -= consumed;
        }

        await tx.insert(billingUsageReservations).values({
          id: reservationId,
          projectSlug: options.project.slug,
          userId: options.userId,
          benefitKey: options.key,
          amount: options.amount,
          idempotencyKey: options.idempotencyKey ?? null,
          grantConsumptions,
          status: BillingUsageReservationStatus.Pending,
          expiresAt: sql`now() + (${options.ttlSeconds ?? 900}::int * interval '1 second')`
        });

        return {
          allowed: true,
          reservationId
        };
      });
    } catch (error) {
      if (error instanceof InsufficientBillingUsageError) {
        return {
          allowed: false,
          reservationId: null,
          summary: await readBillingUsageSummary(options)
        };
      }
      if (options.idempotencyKey && isPostgresUniqueViolation(error)) {
        const existing = await findIdempotentReservation(db, options);
        if (existing) {
          return replayBillingUsageReservation(options, existing);
        }
      }
      throw error;
    }

    return {
      ...transactionResult,
      summary: await readBillingUsageSummary(options)
    };
  });
};

export const commitBillingUsageReservation = async (
  options: AdminDatabaseOptions & {
    project: AuthProject;
    userId: string;
    reservationId: string;
  }
) => {
  await releaseExpiredBillingUsageReservations(options);

  return withAdminDb(options, async ({ db }) => {
    const transactionResult = await db.transaction(async (tx) => {
      const reservations = await tx
        .select({
          id: billingUsageReservations.id,
          benefitKey: billingUsageReservations.benefitKey,
          amount: billingUsageReservations.amount,
          status: billingUsageReservations.status,
          grantConsumptions: billingUsageReservations.grantConsumptions,
          expiresAt: billingUsageReservations.expiresAt
        })
        .from(billingUsageReservations)
        .where(
          and(
            eq(billingUsageReservations.id, options.reservationId),
            eq(billingUsageReservations.projectSlug, options.project.slug),
            eq(billingUsageReservations.userId, options.userId),
            inArray(billingUsageReservations.status, [
              BillingUsageReservationStatus.Pending,
              BillingUsageReservationStatus.Committed
            ])
          )
        )
        .limit(1)
        .for("update");
      const reservation = reservations[0];
      if (!reservation) {
        return null;
      }
      if (reservation.status === BillingUsageReservationStatus.Committed) {
        return {
          allowed: true,
          key: reservation.benefitKey
        };
      }
      if (reservation.expiresAt.getTime() <= Date.now()) {
        await releaseReservation(tx, reservation, BillingUsageReservationStatus.Expired);
        return null;
      }

      await tx.insert(billingUsageEvents).values({
        id: randomBase64Url(24),
        projectSlug: options.project.slug,
        userId: options.userId,
        benefitKey: reservation.benefitKey,
        amount: reservation.amount,
        grantIds: grantIds(reservation.grantConsumptions)
      });
      await tx
        .update(billingUsageReservations)
        .set({
          status: BillingUsageReservationStatus.Committed,
          updatedAt: sql`now()`
        })
        .where(eq(billingUsageReservations.id, reservation.id));

      return {
        allowed: true,
        key: reservation.benefitKey
      };
    });
    if (!transactionResult) {
      return null;
    }

    return {
      allowed: true,
      summary: await readBillingUsageSummary({
        ...options,
        key: transactionResult.key
      })
    };
  });
};

const findIdempotentReservation = async (
  db: AdminDatabase["db"],
  options: {
    project: AuthProject;
    userId: string;
    idempotencyKey?: string;
  }
) => {
  if (!options.idempotencyKey) {
    return null;
  }

  const rows = await db
    .select({
      id: billingUsageReservations.id,
      status: billingUsageReservations.status
    })
    .from(billingUsageReservations)
    .where(
      and(
        eq(billingUsageReservations.projectSlug, options.project.slug),
        eq(billingUsageReservations.userId, options.userId),
        eq(billingUsageReservations.idempotencyKey, options.idempotencyKey)
      )
    )
    .limit(1);

  return rows[0] ?? null;
};

const replayBillingUsageReservation = async (
  options: AdminDatabaseOptions & {
    project: AuthProject;
    userId: string;
    key: string;
  },
  reservation: { id: string; status: string }
): Promise<BillingUsageReservationResult> => {
  const allowed =
    reservation.status === BillingUsageReservationStatus.Pending ||
    reservation.status === BillingUsageReservationStatus.Committed;

  return {
    allowed,
    reservationId: reservation.id,
    summary: await readBillingUsageSummary(options)
  };
};

export const releaseBillingUsageReservation = async (
  options: AdminDatabaseOptions & {
    project: AuthProject;
    userId: string;
    reservationId: string;
  }
) => {
  return withAdminDb(options, async ({ db }) => {
    const transactionResult = await db.transaction(async (tx) => {
      const reservations = await tx
        .select({
          id: billingUsageReservations.id,
          benefitKey: billingUsageReservations.benefitKey,
          amount: billingUsageReservations.amount,
          grantConsumptions: billingUsageReservations.grantConsumptions,
          expiresAt: billingUsageReservations.expiresAt
        })
        .from(billingUsageReservations)
        .where(
          and(
            eq(billingUsageReservations.id, options.reservationId),
            eq(billingUsageReservations.projectSlug, options.project.slug),
            eq(billingUsageReservations.userId, options.userId),
            eq(billingUsageReservations.status, BillingUsageReservationStatus.Pending)
          )
        )
        .limit(1)
        .for("update");
      const reservation = reservations[0];
      if (!reservation) {
        return null;
      }

      await releaseReservation(tx, reservation, BillingUsageReservationStatus.Released);

      return {
        released: true,
        key: reservation.benefitKey
      };
    });
    if (!transactionResult) {
      return null;
    }

    return {
      released: true,
      summary: await readBillingUsageSummary({
        ...options,
        key: transactionResult.key
      })
    };
  });
};

export const grantBillingProductEntitlements = async (
  options: AdminDatabaseOptions & {
    project: AuthProject;
    userId: string;
    productId: string;
    sourceId: string;
    metadata: unknown;
  }
) => {
  const product = options.project.billing.products.find(
    (candidate) => candidate.active && candidate.productId === options.productId
  );
  if (!product) {
    return 0;
  }

  await grantEntitlements({
    ...options,
    product,
    entitlements: product.entitlements,
    sourceType: BillingEntitlementSourceType.PolarOrder,
    sourceId: options.sourceId,
    metadata: options.metadata
  });

  return product.entitlements.length;
};

const ensureFreeEntitlementGrants = async (
  options: AdminDatabaseOptions & {
    project: AuthProject;
    userId: string;
  }
) => {
  const entitlements = options.project.billing.freeEntitlements;
  if (entitlements.length > 0) {
    await grantEntitlements({
      ...options,
      product: null,
      entitlements,
      sourceType: BillingEntitlementSourceType.Free,
      sourceId: "default",
      metadata: {},
      reconcileExisting: true
    });
  }

  await withAdminDb(options, async ({ db }) => {
    const desiredKeys = entitlements.map((entitlement) => entitlement.key);
    await db
      .update(billingEntitlementGrants)
      .set({
        active: false,
        remaining: sql`CASE WHEN ${billingEntitlementGrants.remaining} IS NULL THEN NULL ELSE 0 END`,
        updatedAt: sql`now()`
      })
      .where(
        and(
          eq(billingEntitlementGrants.projectSlug, options.project.slug),
          eq(billingEntitlementGrants.userId, options.userId),
          eq(
            billingEntitlementGrants.sourceType,
            BillingEntitlementSourceType.Free
          ),
          eq(billingEntitlementGrants.sourceId, "default"),
          eq(billingEntitlementGrants.active, true),
          desiredKeys.length > 0
            ? notInArray(billingEntitlementGrants.benefitKey, desiredKeys)
            : undefined
        )
      );
  });
};

const resetDueBillingEntitlements = async (
  options: AdminDatabaseOptions & {
    project: AuthProject;
    userId: string;
    key?: string;
  }
) => {
  await withAdminDb(options, async ({ db }) => {
    await db
      .update(billingEntitlementGrants)
      .set({
        remaining: billingEntitlementGrants.amount,
        resetAt: sql`
          CASE ${billingEntitlementGrants.resetPeriod}
            WHEN ${EntitlementResetPeriod.Monthly} THEN now() + interval '1 month'
            WHEN ${EntitlementResetPeriod.Yearly} THEN now() + interval '1 year'
            ELSE NULL
          END
        `,
        updatedAt: sql`now()`
      })
      .where(
        and(
          eq(billingEntitlementGrants.projectSlug, options.project.slug),
          eq(billingEntitlementGrants.userId, options.userId),
          options.key
            ? eq(billingEntitlementGrants.benefitKey, options.key)
            : undefined,
          eq(billingEntitlementGrants.active, true),
          eq(
            billingEntitlementGrants.grantType,
            EntitlementGrantType.RecurringQuota
          ),
          lt(billingEntitlementGrants.resetAt, sql`now()`)
        )
      );
  });
};

export const deactivateBillingEntitlementSource = async (
  options: AdminDatabaseOptions & {
    project: AuthProject;
    sourceType: string;
    sourceId: string;
    metadata: unknown;
  }
) => {
  return withAdminDb(options, async ({ db }) => {
    const result = await db
      .update(billingEntitlementGrants)
      .set({
        active: false,
        remaining: sql`CASE WHEN ${billingEntitlementGrants.remaining} IS NULL THEN NULL ELSE 0 END`,
        metadata: options.metadata,
        updatedAt: sql`now()`
      })
      .where(
        and(
          eq(billingEntitlementGrants.projectSlug, options.project.slug),
          eq(billingEntitlementGrants.sourceType, options.sourceType),
          eq(billingEntitlementGrants.sourceId, options.sourceId),
          eq(billingEntitlementGrants.active, true)
        )
      )
      .returning({ id: billingEntitlementGrants.id });

    return result.length;
  });
};

const releaseExpiredBillingUsageReservations = async (
  options: AdminDatabaseOptions & {
    project: AuthProject;
    userId?: string;
    key?: string;
  }
) => {
  return withAdminDb(options, async ({ db }) => {
    return db.transaction(async (tx) => {
      const reservations = await tx
        .select({
          id: billingUsageReservations.id,
          benefitKey: billingUsageReservations.benefitKey,
          amount: billingUsageReservations.amount,
          grantConsumptions: billingUsageReservations.grantConsumptions,
          expiresAt: billingUsageReservations.expiresAt
        })
        .from(billingUsageReservations)
        .where(
          and(
            eq(billingUsageReservations.projectSlug, options.project.slug),
            options.userId
              ? eq(billingUsageReservations.userId, options.userId)
              : undefined,
            options.key
              ? eq(billingUsageReservations.benefitKey, options.key)
              : undefined,
            eq(billingUsageReservations.status, BillingUsageReservationStatus.Pending),
            lt(billingUsageReservations.expiresAt, sql`now()`)
          )
        )
        .for("update", { skipLocked: true });

      for (const reservation of reservations) {
        await releaseReservation(
          tx,
          reservation,
          BillingUsageReservationStatus.Expired
        );
      }

      return reservations.length;
    });
  });
};

const releaseReservation = async (
  tx: BillingUsageTransaction,
  reservation: ReservationRow,
  status: BillingUsageReservationStatus.Released | BillingUsageReservationStatus.Expired
) => {
  for (const consumption of parseGrantConsumptions(reservation.grantConsumptions)) {
    if (consumption.amount === null) {
      continue;
    }

    await tx
      .update(billingEntitlementGrants)
      .set({
        remaining: sql`${billingEntitlementGrants.remaining} + ${consumption.amount}`,
        updatedAt: sql`now()`
      })
      .where(eq(billingEntitlementGrants.id, consumption.id));
  }

  await tx
    .update(billingUsageReservations)
    .set({
      status,
      updatedAt: sql`now()`
    })
    .where(eq(billingUsageReservations.id, reservation.id));
};

const parseGrantConsumptions = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const consumptions: GrantConsumption[] = [];
  for (const item of value) {
    if (
      isRecord(item) &&
      "id" in item &&
      "amount" in item &&
      typeof item.id === "string" &&
      (typeof item.amount === "number" || item.amount === null)
    ) {
      consumptions.push({
        id: item.id,
        amount: item.amount
      });
    }
  }

  return consumptions;
};

const grantIds = (value: unknown) => {
  return parseGrantConsumptions(value).map((consumption) => consumption.id);
};

export const deactivateBillingSubscriptionEntitlements = async (
  options: AdminDatabaseOptions & {
    project: AuthProject;
    subscriptionId: string;
    metadata: unknown;
  }
) => {
  return withAdminDb(options, async ({ db }) => {
    const result = await db
      .update(billingEntitlementGrants)
      .set({
        active: false,
        remaining: sql`CASE WHEN ${billingEntitlementGrants.remaining} IS NULL THEN NULL ELSE 0 END`,
        metadata: options.metadata,
        updatedAt: sql`now()`
      })
      .where(
        and(
          eq(billingEntitlementGrants.projectSlug, options.project.slug),
          eq(billingEntitlementGrants.active, true),
          eq(
            sql`${billingEntitlementGrants.metadata} #>> '{data,subscriptionId}'`,
            options.subscriptionId
          )
        )
      )
      .returning({ id: billingEntitlementGrants.id });

    return result.length;
  });
};

const grantEntitlements = async (
  options: AdminDatabaseOptions & {
    project: AuthProject;
    userId: string;
    product: BillingProductMapping | null;
    entitlements: BillingEntitlement[];
    sourceType: string;
    sourceId: string;
    metadata: unknown;
    reconcileExisting?: boolean;
  }
) => {
  await withAdminDb(options, async ({ db }) => {
    for (const entitlement of options.entitlements) {
      const reconcileExisting = options.reconcileExisting === true;
      const values = {
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
      };
      const insert = db
        .insert(billingEntitlementGrants)
        .values(values);

      if (!reconcileExisting) {
        await insert.onConflictDoNothing();
        continue;
      }

      await insert.onConflictDoUpdate({
          target: [
            billingEntitlementGrants.projectSlug,
            billingEntitlementGrants.userId,
            billingEntitlementGrants.benefitKey,
            billingEntitlementGrants.sourceType,
            billingEntitlementGrants.sourceId
          ],
          set: {
            grantType: sql`EXCLUDED.grant_type`,
            amount: sql`EXCLUDED.amount`,
            remaining: sql`
                  CASE
                    WHEN ${billingEntitlementGrants.active} = false THEN EXCLUDED.remaining
                    WHEN EXCLUDED.amount IS NULL THEN NULL
                    WHEN ${billingEntitlementGrants.amount} IS NULL THEN EXCLUDED.remaining
                    ELSE GREATEST(
                      0,
                      EXCLUDED.amount - GREATEST(
                        0,
                        ${billingEntitlementGrants.amount} - COALESCE(${billingEntitlementGrants.remaining}, 0)
                      )
                    )
                  END
                `,
            resetPeriod: sql`EXCLUDED.reset_period`,
            resetAt: sql`
              CASE
                WHEN ${billingEntitlementGrants.resetPeriod} IS DISTINCT FROM EXCLUDED.reset_period
                  THEN EXCLUDED.reset_at
                ELSE ${billingEntitlementGrants.resetAt}
              END
            `,
            priority: sql`EXCLUDED.priority`,
            productSlug: sql`EXCLUDED.product_slug`,
            active: true,
            metadata: sql`EXCLUDED.metadata`,
            updatedAt: sql`now()`
          },
          setWhere: sql`
            ${billingEntitlementGrants.grantType} IS DISTINCT FROM EXCLUDED.grant_type
            OR ${billingEntitlementGrants.amount} IS DISTINCT FROM EXCLUDED.amount
            OR ${billingEntitlementGrants.resetPeriod} IS DISTINCT FROM EXCLUDED.reset_period
            OR ${billingEntitlementGrants.priority} IS DISTINCT FROM EXCLUDED.priority
            OR ${billingEntitlementGrants.productSlug} IS DISTINCT FROM EXCLUDED.product_slug
            OR ${billingEntitlementGrants.active} = false
            OR ${billingEntitlementGrants.metadata} IS DISTINCT FROM EXCLUDED.metadata
          `
        });
    }
  });
};

const initialResetAt = (entitlement: BillingEntitlement) => {
  const resetAt = new Date();
  if (entitlement.resetPeriod === EntitlementResetPeriod.Monthly) {
    resetAt.setUTCMonth(resetAt.getUTCMonth() + 1);
    return resetAt;
  }
  if (entitlement.resetPeriod === EntitlementResetPeriod.Yearly) {
    resetAt.setUTCFullYear(resetAt.getUTCFullYear() + 1);
    return resetAt;
  }

  return null;
};

const initialRemaining = (entitlement: BillingEntitlement) => {
  if (
    entitlement.grantType === EntitlementGrantType.Boolean ||
    entitlement.grantType === EntitlementGrantType.Lifetime
  ) {
    return null;
  }

  return entitlement.amount ?? 0;
};

const usageSummary = (key: string, row: SummaryRow | undefined): BillingUsageSummary => {
  const unlimited = row?.unlimited === true;
  const limit = unlimited ? -1 : row?.limit ?? 0;
  const remaining = unlimited ? -1 : row?.remaining ?? 0;

  return {
    key,
    used: unlimited ? 0 : Math.max(0, limit - remaining),
    limit,
    remaining,
    unlimited
  };
};
