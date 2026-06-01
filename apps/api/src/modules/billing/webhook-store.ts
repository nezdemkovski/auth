import { sql } from "drizzle-orm";

import type { AdminDatabaseOptions } from "../../db/admin-pool";
import { withAdminDb } from "../../db/admin-pool";
import {
  billingBenefitGrants,
  billingCustomerStates,
  billingOrders,
  billingSubscriptions,
  billingWebhookEvents
} from "./tables";

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
    const result = await db
      .insert(billingWebhookEvents)
      .values({
        projectSlug: input.projectSlug,
        eventKey: input.eventKey,
        eventType: input.eventType,
        resourceId: input.resourceId,
        occurredAt: input.occurredAt,
        payload: input.payload
      })
      .onConflictDoNothing({
        target: [billingWebhookEvents.projectSlug, billingWebhookEvents.eventKey]
      })
      .returning({ eventKey: billingWebhookEvents.eventKey });

    return result.length > 0;
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
