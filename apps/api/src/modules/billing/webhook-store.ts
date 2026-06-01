import { sql } from "drizzle-orm";

import type { AdminDatabaseOptions } from "../../db/admin-pool";
import { withAdminDb } from "../../db/admin-pool";

export type PolarWebhookEventInput = {
  projectSlug: string;
  eventKey: string;
  eventType: string;
  resourceId: string;
  occurredAt: Date;
  payload: unknown;
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
  recordEvent(input: PolarWebhookEventInput): Promise<boolean>;
  upsertOrder(input: PolarOrderSnapshotInput): Promise<void>;
  upsertCustomerState(input: PolarCustomerStateSnapshotInput): Promise<void>;
  upsertBenefitGrant(input: PolarBenefitGrantSnapshotInput): Promise<void>;
  upsertSubscription(input: PolarSubscriptionSnapshotInput): Promise<void>;
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
  return {
    recordEvent: (input) => recordPolarWebhookEvent(options, input),
    upsertOrder: (input) => upsertPolarOrder(options, input),
    upsertCustomerState: (input) => upsertPolarCustomerState(options, input),
    upsertBenefitGrant: (input) => upsertPolarBenefitGrant(options, input),
    upsertSubscription: (input) => upsertPolarSubscription(options, input)
  };
};

const recordPolarWebhookEvent = async (
  options: AdminDatabaseOptions,
  input: PolarWebhookEventInput
) => {
  return withAdminDb(options, async ({ db }) => {
    const result = await db.execute<{ eventKey: string }>(sql`
      INSERT INTO auth_billing_webhook_events (
        project_slug,
        event_key,
        event_type,
        resource_id,
        occurred_at,
        payload
      )
      VALUES (
        ${input.projectSlug},
        ${input.eventKey},
        ${input.eventType},
        ${input.resourceId},
        ${input.occurredAt},
        ${JSON.stringify(input.payload)}::jsonb
      )
      ON CONFLICT (project_slug, event_key) DO NOTHING
      RETURNING event_key AS "eventKey"
    `);

    return result.rows.length > 0;
  });
};

const upsertPolarOrder = async (
  options: AdminDatabaseOptions,
  input: PolarOrderSnapshotInput
) => {
  await withAdminDb(options, async ({ db }) => {
    await db.execute(sql`
      INSERT INTO auth_billing_orders (
        project_slug,
        order_id,
        customer_id,
        product_id,
        subscription_id,
        status,
        paid,
        total_amount,
        refunded_amount,
        currency,
        payload
      )
      VALUES (
        ${input.projectSlug},
        ${input.orderId},
        ${input.customerId},
        ${input.productId},
        ${input.subscriptionId},
        ${input.status},
        ${input.paid},
        ${input.totalAmount},
        ${input.refundedAmount},
        ${input.currency},
        ${JSON.stringify(input.payload)}::jsonb
      )
      ON CONFLICT (project_slug, order_id) DO UPDATE
      SET customer_id = EXCLUDED.customer_id,
          product_id = EXCLUDED.product_id,
          subscription_id = EXCLUDED.subscription_id,
          status = EXCLUDED.status,
          paid = EXCLUDED.paid,
          total_amount = EXCLUDED.total_amount,
          refunded_amount = EXCLUDED.refunded_amount,
          currency = EXCLUDED.currency,
          payload = EXCLUDED.payload,
          updated_at = now()
    `);
  });
};

const upsertPolarCustomerState = async (
  options: AdminDatabaseOptions,
  input: PolarCustomerStateSnapshotInput
) => {
  await withAdminDb(options, async ({ db }) => {
    await db.execute(sql`
      INSERT INTO auth_billing_customer_states (
        project_slug,
        customer_id,
        external_id,
        payload
      )
      VALUES (
        ${input.projectSlug},
        ${input.customerId},
        ${input.externalId ?? null},
        ${JSON.stringify(input.payload)}::jsonb
      )
      ON CONFLICT (project_slug, customer_id) DO UPDATE
      SET external_id = EXCLUDED.external_id,
          payload = EXCLUDED.payload,
          updated_at = now()
    `);
  });
};

const upsertPolarBenefitGrant = async (
  options: AdminDatabaseOptions,
  input: PolarBenefitGrantSnapshotInput
) => {
  await withAdminDb(options, async ({ db }) => {
    await db.execute(sql`
      INSERT INTO auth_billing_benefit_grants (
        project_slug,
        grant_id,
        customer_id,
        benefit_id,
        subscription_id,
        order_id,
        revoked,
        payload
      )
      VALUES (
        ${input.projectSlug},
        ${input.grantId},
        ${input.customerId},
        ${input.benefitId},
        ${input.subscriptionId},
        ${input.orderId},
        ${input.revoked},
        ${JSON.stringify(input.payload)}::jsonb
      )
      ON CONFLICT (project_slug, grant_id) DO UPDATE
      SET customer_id = EXCLUDED.customer_id,
          benefit_id = EXCLUDED.benefit_id,
          subscription_id = EXCLUDED.subscription_id,
          order_id = EXCLUDED.order_id,
          revoked = EXCLUDED.revoked,
          payload = EXCLUDED.payload,
          updated_at = now()
    `);
  });
};

const upsertPolarSubscription = async (
  options: AdminDatabaseOptions,
  input: PolarSubscriptionSnapshotInput
) => {
  await withAdminDb(options, async ({ db }) => {
    await db.execute(sql`
      INSERT INTO auth_billing_subscriptions (
        project_slug,
        subscription_id,
        customer_id,
        product_id,
        status,
        cancel_at_period_end,
        current_period_start,
        current_period_end,
        ended_at,
        payload
      )
      VALUES (
        ${input.projectSlug},
        ${input.subscriptionId},
        ${input.customerId},
        ${input.productId},
        ${input.status},
        ${input.cancelAtPeriodEnd},
        ${input.currentPeriodStart},
        ${input.currentPeriodEnd},
        ${input.endedAt},
        ${JSON.stringify(input.payload)}::jsonb
      )
      ON CONFLICT (project_slug, subscription_id) DO UPDATE
      SET customer_id = EXCLUDED.customer_id,
          product_id = EXCLUDED.product_id,
          status = EXCLUDED.status,
          cancel_at_period_end = EXCLUDED.cancel_at_period_end,
          current_period_start = EXCLUDED.current_period_start,
          current_period_end = EXCLUDED.current_period_end,
          ended_at = EXCLUDED.ended_at,
          payload = EXCLUDED.payload,
          updated_at = now()
    `);
  });
};
