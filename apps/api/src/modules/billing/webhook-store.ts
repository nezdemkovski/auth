import { sql } from "drizzle-orm";

import type { AdminDatabaseOptions } from "../../db/admin-pool";
import { createAdminPool, withAdminDb } from "../../db/admin-pool";
import { logError } from "../../runtime/logger";
import {
  billingBenefitGrants,
  billingCustomerStates,
  billingOrders,
  billingSubscriptions
} from "./tables";

export type PolarWebhookEventInput = {
  projectSlug: string;
  eventKey: string;
  eventType: string;
  resourceId: string;
  occurredAt: Date;
  payload: unknown;
};

export enum PolarWebhookEventStatus {
  Failed = "failed",
  Processed = "processed",
  Processing = "processing"
}

export type PolarWebhookResourceVersionInput = {
  projectSlug: string;
  resourceType: string;
  resourceId: string;
  versionKey: string;
  eventKey: string;
};

export type PolarOrderSnapshotInput = {
  projectSlug: string;
  orderId: string;
  customerId: string;
  productId: string | null;
  subscriptionId: string | null;
  status: string;
  paid: boolean;
  totalAmount: number;
  refundedAmount: number;
  currency: string;
  payload: unknown;
};

export type PolarCustomerStateSnapshotInput = {
  projectSlug: string;
  customerId: string;
  externalId: string | null | undefined;
  payload: unknown;
};

export type PolarBenefitGrantSnapshotInput = {
  projectSlug: string;
  grantId: string;
  customerId: string;
  benefitId: string;
  subscriptionId: string | null;
  orderId: string | null;
  revoked: boolean;
  payload: unknown;
};

export type PolarSubscriptionSnapshotInput = {
  projectSlug: string;
  subscriptionId: string;
  customerId: string;
  productId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  endedAt: Date | null;
  payload: unknown;
};

export type PolarWebhookStore = {
  withResourceLock<T>(
    input: Pick<
      PolarWebhookResourceVersionInput,
      "projectSlug" | "resourceType" | "resourceId"
    >,
    operation: () => Promise<T>
  ): Promise<T>;
  claimEvent(input: PolarWebhookEventInput): Promise<boolean>;
  claimResourceVersion(input: PolarWebhookResourceVersionInput): Promise<boolean>;
  releaseResourceVersion(input: PolarWebhookResourceVersionInput): Promise<void>;
  completeEvent(projectSlug: string, eventKey: string): Promise<void>;
  failEvent(projectSlug: string, eventKey: string): Promise<void>;
  upsertOrder(input: PolarOrderSnapshotInput): Promise<void>;
  upsertCustomerState(input: PolarCustomerStateSnapshotInput): Promise<void>;
  upsertBenefitGrant(input: PolarBenefitGrantSnapshotInput): Promise<void>;
  upsertSubscription(input: PolarSubscriptionSnapshotInput): Promise<void>;
  close(): Promise<void>;
};

export const ensureBillingWebhookTables = async (options: AdminDatabaseOptions) => {
  await withAdminDb(options, async ({ db }) => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS auth_billing_webhook_events (
        project_slug text NOT NULL REFERENCES auth_project_settings(slug) ON DELETE CASCADE,
        event_key text NOT NULL,
        event_type text NOT NULL,
        resource_id text NOT NULL,
        occurred_at timestamptz NOT NULL,
        received_at timestamptz NOT NULL DEFAULT now(),
        processed_at timestamptz NOT NULL DEFAULT now(),
        payload jsonb NOT NULL,
        PRIMARY KEY (project_slug, event_key)
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS auth_billing_webhook_events_project_type_idx
      ON auth_billing_webhook_events (project_slug, event_type, occurred_at DESC)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS auth_billing_webhook_events_received_at_idx
      ON auth_billing_webhook_events (received_at)
    `);
    await db.execute(sql`
      ALTER TABLE auth_billing_webhook_events
      ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'processed'
    `);
    await db.execute(sql`
      ALTER TABLE auth_billing_webhook_events
      ADD COLUMN IF NOT EXISTS processing_started_at timestamptz NOT NULL DEFAULT now()
    `);
    await db.execute(sql`
      ALTER TABLE auth_billing_webhook_events
      ALTER COLUMN processed_at DROP NOT NULL
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS auth_billing_webhook_resource_versions (
        project_slug text NOT NULL REFERENCES auth_project_settings(slug) ON DELETE CASCADE,
        resource_type text NOT NULL,
        resource_id text NOT NULL,
        version_key text NOT NULL,
        event_key text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (project_slug, resource_type, resource_id)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS auth_billing_orders (
        project_slug text NOT NULL REFERENCES auth_project_settings(slug) ON DELETE CASCADE,
        order_id text NOT NULL,
        customer_id text NOT NULL,
        product_id text,
        subscription_id text,
        status text NOT NULL,
        paid boolean NOT NULL,
        total_amount integer NOT NULL,
        refunded_amount integer NOT NULL,
        currency text NOT NULL,
        payload jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (project_slug, order_id)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS auth_billing_customer_states (
        project_slug text NOT NULL REFERENCES auth_project_settings(slug) ON DELETE CASCADE,
        customer_id text NOT NULL,
        external_id text,
        payload jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (project_slug, customer_id)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS auth_billing_benefit_grants (
        project_slug text NOT NULL REFERENCES auth_project_settings(slug) ON DELETE CASCADE,
        grant_id text NOT NULL,
        customer_id text NOT NULL,
        benefit_id text NOT NULL,
        subscription_id text,
        order_id text,
        revoked boolean NOT NULL,
        payload jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (project_slug, grant_id)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS auth_billing_subscriptions (
        project_slug text NOT NULL REFERENCES auth_project_settings(slug) ON DELETE CASCADE,
        subscription_id text NOT NULL,
        customer_id text NOT NULL,
        product_id text NOT NULL,
        status text NOT NULL,
        cancel_at_period_end boolean NOT NULL,
        current_period_start timestamptz NOT NULL,
        current_period_end timestamptz NOT NULL,
        ended_at timestamptz,
        payload jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (project_slug, subscription_id)
      )
    `);
  });
};

export const createPolarWebhookStore = (
  options: AdminDatabaseOptions
): PolarWebhookStore => {
  const lockPool = createAdminPool(options.databaseUrl, options.adminProject);

  return {
    withResourceLock: (input, operation) =>
      withPolarWebhookResourceLock(lockPool, input, operation),
    claimEvent: (input) => claimPolarWebhookEvent(options, input),
    claimResourceVersion: (input) => claimPolarWebhookResourceVersion(options, input),
    releaseResourceVersion: (input) => releasePolarWebhookResourceVersion(options, input),
    completeEvent: (projectSlug, eventKey) =>
      updatePolarWebhookEventStatus(
        options,
        projectSlug,
        eventKey,
        PolarWebhookEventStatus.Processed
      ),
    failEvent: (projectSlug, eventKey) =>
      updatePolarWebhookEventStatus(
        options,
        projectSlug,
        eventKey,
        PolarWebhookEventStatus.Failed
      ),
    upsertOrder: (input) => upsertPolarOrder(options, input),
    upsertCustomerState: (input) => upsertPolarCustomerState(options, input),
    upsertBenefitGrant: (input) => upsertPolarBenefitGrant(options, input),
    upsertSubscription: (input) => upsertPolarSubscription(options, input),
    close: () => lockPool.end()
  };
};

const withPolarWebhookResourceLock = async <T>(
  pool: ReturnType<typeof createAdminPool>,
  input: Pick<
    PolarWebhookResourceVersionInput,
    "projectSlug" | "resourceType" | "resourceId"
  >,
  operation: () => Promise<T>
) => {
  const client = await pool.connect();
  const resourceKey = `${input.resourceType}:${input.resourceId}`;
  let locked = false;

  try {
    await client.query(
      "SELECT pg_advisory_lock(hashtext($1), hashtext($2))",
      [input.projectSlug, resourceKey]
    );
    locked = true;
    return await operation();
  } finally {
    if (locked) {
      await client
        .query("SELECT pg_advisory_unlock(hashtext($1), hashtext($2))", [
          input.projectSlug,
          resourceKey
        ])
        .catch((error) => {
          logError("polar_webhook_advisory_unlock_failed", {
            projectSlug: input.projectSlug,
            resourceType: input.resourceType,
            resourceId: input.resourceId,
            error: error instanceof Error ? error.message : String(error)
          });
        });
    }
    client.release();
  }
};

const claimPolarWebhookEvent = async (
  options: AdminDatabaseOptions,
  input: PolarWebhookEventInput
) => {
  return withAdminDb(options, async ({ db }) => {
    await db.execute(sql`
      DELETE FROM auth_billing_webhook_events
      WHERE ctid IN (
        SELECT ctid
        FROM auth_billing_webhook_events
        WHERE received_at < now() - interval '30 days'
        ORDER BY received_at
        LIMIT 1000
      )
    `);

    const result = await db.execute<{ eventKey: string }>(sql`
      INSERT INTO auth_billing_webhook_events (
        project_slug,
        event_key,
        event_type,
        resource_id,
        occurred_at,
        status,
        processing_started_at,
        processed_at,
        payload
      ) VALUES (
        ${input.projectSlug},
        ${input.eventKey},
        ${input.eventType},
        ${input.resourceId},
        ${input.occurredAt},
        ${PolarWebhookEventStatus.Processing},
        now(),
        NULL,
        ${JSON.stringify(input.payload)}::jsonb
      )
      ON CONFLICT (project_slug, event_key) DO UPDATE SET
        status = 'processing',
        processing_started_at = now(),
        processed_at = NULL,
        payload = EXCLUDED.payload
      WHERE auth_billing_webhook_events.status = ${PolarWebhookEventStatus.Failed}
         OR (
           auth_billing_webhook_events.status = ${PolarWebhookEventStatus.Processing}
           AND auth_billing_webhook_events.processing_started_at < now() - interval '5 minutes'
         )
      RETURNING event_key AS "eventKey"
    `);

    return result.rows.length > 0;
  });
};

const claimPolarWebhookResourceVersion = async (
  options: AdminDatabaseOptions,
  input: PolarWebhookResourceVersionInput
) => {
  return withAdminDb(options, async ({ db }) => {
    const result = await db.execute<{ eventKey: string }>(sql`
      INSERT INTO auth_billing_webhook_resource_versions (
        project_slug,
        resource_type,
        resource_id,
        version_key,
        event_key
      ) VALUES (
        ${input.projectSlug},
        ${input.resourceType},
        ${input.resourceId},
        ${input.versionKey},
        ${input.eventKey}
      )
      ON CONFLICT (project_slug, resource_type, resource_id) DO UPDATE SET
        version_key = EXCLUDED.version_key,
        event_key = EXCLUDED.event_key,
        updated_at = now()
      WHERE EXCLUDED.version_key > auth_billing_webhook_resource_versions.version_key
      RETURNING event_key AS "eventKey"
    `);

    return result.rows.length > 0;
  });
};

const updatePolarWebhookEventStatus = async (
  options: AdminDatabaseOptions,
  projectSlug: string,
  eventKey: string,
  status: PolarWebhookEventStatus.Processed | PolarWebhookEventStatus.Failed
) => {
  await withAdminDb(options, async ({ db }) => {
    await db.execute(sql`
      UPDATE auth_billing_webhook_events
      SET
        status = ${status},
        processed_at = CASE WHEN ${status} = 'processed' THEN now() ELSE NULL END
      WHERE project_slug = ${projectSlug}
        AND event_key = ${eventKey}
    `);
  });
};

const releasePolarWebhookResourceVersion = async (
  options: AdminDatabaseOptions,
  input: PolarWebhookResourceVersionInput
) => {
  await withAdminDb(options, async ({ db }) => {
    await db.execute(sql`
      DELETE FROM auth_billing_webhook_resource_versions
      WHERE project_slug = ${input.projectSlug}
        AND resource_type = ${input.resourceType}
        AND resource_id = ${input.resourceId}
        AND event_key = ${input.eventKey}
    `);
  });
};

const upsertPolarOrder = async (
  options: AdminDatabaseOptions,
  input: PolarOrderSnapshotInput
) => {
  await withAdminDb(options, async ({ db }) => {
    await db
      .insert(billingOrders)
      .values({
        projectSlug: input.projectSlug,
        orderId: input.orderId,
        customerId: input.customerId,
        productId: input.productId,
        subscriptionId: input.subscriptionId,
        status: input.status,
        paid: input.paid,
        totalAmount: input.totalAmount,
        refundedAmount: input.refundedAmount,
        currency: input.currency,
        payload: input.payload
      })
      .onConflictDoUpdate({
        target: [billingOrders.projectSlug, billingOrders.orderId],
        set: {
          customerId: input.customerId,
          productId: input.productId,
          subscriptionId: input.subscriptionId,
          status: input.status,
          paid: input.paid,
          totalAmount: input.totalAmount,
          refundedAmount: input.refundedAmount,
          currency: input.currency,
          payload: input.payload,
          updatedAt: sql`now()`
        }
      });
  });
};

const upsertPolarCustomerState = async (
  options: AdminDatabaseOptions,
  input: PolarCustomerStateSnapshotInput
) => {
  await withAdminDb(options, async ({ db }) => {
    await db
      .insert(billingCustomerStates)
      .values({
        projectSlug: input.projectSlug,
        customerId: input.customerId,
        externalId: input.externalId ?? null,
        payload: input.payload
      })
      .onConflictDoUpdate({
        target: [billingCustomerStates.projectSlug, billingCustomerStates.customerId],
        set: {
          externalId: input.externalId ?? null,
          payload: input.payload,
          updatedAt: sql`now()`
        }
      });
  });
};

const upsertPolarBenefitGrant = async (
  options: AdminDatabaseOptions,
  input: PolarBenefitGrantSnapshotInput
) => {
  await withAdminDb(options, async ({ db }) => {
    await db
      .insert(billingBenefitGrants)
      .values({
        projectSlug: input.projectSlug,
        grantId: input.grantId,
        customerId: input.customerId,
        benefitId: input.benefitId,
        subscriptionId: input.subscriptionId,
        orderId: input.orderId,
        revoked: input.revoked,
        payload: input.payload
      })
      .onConflictDoUpdate({
        target: [billingBenefitGrants.projectSlug, billingBenefitGrants.grantId],
        set: {
          customerId: input.customerId,
          benefitId: input.benefitId,
          subscriptionId: input.subscriptionId,
          orderId: input.orderId,
          revoked: input.revoked,
          payload: input.payload,
          updatedAt: sql`now()`
        }
      });
  });
};

const upsertPolarSubscription = async (
  options: AdminDatabaseOptions,
  input: PolarSubscriptionSnapshotInput
) => {
  await withAdminDb(options, async ({ db }) => {
    await db
      .insert(billingSubscriptions)
      .values({
        projectSlug: input.projectSlug,
        subscriptionId: input.subscriptionId,
        customerId: input.customerId,
        productId: input.productId,
        status: input.status,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd,
        currentPeriodStart: input.currentPeriodStart,
        currentPeriodEnd: input.currentPeriodEnd,
        endedAt: input.endedAt,
        payload: input.payload
      })
      .onConflictDoUpdate({
        target: [billingSubscriptions.projectSlug, billingSubscriptions.subscriptionId],
        set: {
          customerId: input.customerId,
          productId: input.productId,
          status: input.status,
          cancelAtPeriodEnd: input.cancelAtPeriodEnd,
          currentPeriodStart: input.currentPeriodStart,
          currentPeriodEnd: input.currentPeriodEnd,
          endedAt: input.endedAt,
          payload: input.payload,
          updatedAt: sql`now()`
        }
      });
  });
};
