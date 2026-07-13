import {
  type AdminDatabaseOptions,
  withAdminDb
} from "@nezdemkovski/auth-platform-database";
import { and, eq, sql } from "drizzle-orm";

import {
  billingEntitlementGrants,
  billingOrders,
  billingWebhookEvents
} from "./tables";

export const expireBillingEntitlementReset = async (
  options: AdminDatabaseOptions & {
    projectSlug: string;
    userId: string;
    benefitKey: string;
  }
) => {
  await withAdminDb(options, async ({ db }) => {
    await db
      .update(billingEntitlementGrants)
      .set({ resetAt: sql`now() - interval '1 second'` })
      .where(
        and(
          eq(billingEntitlementGrants.projectSlug, options.projectSlug),
          eq(billingEntitlementGrants.userId, options.userId),
          eq(billingEntitlementGrants.benefitKey, options.benefitKey)
        )
      );
  });
};

export const seedExpiredBillingWebhookEvent = async (
  options: AdminDatabaseOptions & {
    projectSlug: string;
    eventKey: string;
    eventType: string;
    resourceId: string;
    payload: unknown;
  }
) => {
  const expiredAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1_000);

  await withAdminDb(options, async ({ db }) => {
    await db.insert(billingWebhookEvents).values({
      projectSlug: options.projectSlug,
      eventKey: options.eventKey,
      eventType: options.eventType,
      resourceId: options.resourceId,
      occurredAt: expiredAt,
      receivedAt: expiredAt,
      payload: options.payload
    });
  });
};

export const readBillingWebhookPayloads = async (
  options: AdminDatabaseOptions & {
    projectSlug: string;
    orderId: string;
  }
) => {
  return withAdminDb(options, async ({ db }) => {
    const [events, orders] = await Promise.all([
      db
        .select({ payload: billingWebhookEvents.payload })
        .from(billingWebhookEvents)
        .where(eq(billingWebhookEvents.projectSlug, options.projectSlug)),
      db
        .select({ payload: billingOrders.payload })
        .from(billingOrders)
        .where(
          and(
            eq(billingOrders.projectSlug, options.projectSlug),
            eq(billingOrders.orderId, options.orderId)
          )
        )
    ]);

    return {
      events: events.map((event) => event.payload),
      orders: orders.map((order) => order.payload)
    };
  });
};
