import { SubscriptionStatus } from "@polar-sh/sdk/models/components/subscriptionstatus";
import type { validateEvent } from "@polar-sh/sdk/webhooks";

import { isRecord } from "./guards";
import type { BillingRealm } from "./model";
import type { BillingLogger } from "./ports";
import {
  BillingEntitlementSourceType,
  type PolarEntitlementGrantStore
} from "./usage-store";
import type { PolarWebhookStore } from "./webhook-store";

export enum PolarWebhookEventGroup {
  BenefitGrant = "benefit_grant",
  Customer = "customer",
  Order = "order",
  Subscription = "subscription",
  Unknown = "unknown"
}

export type PolarWebhookPayload = ReturnType<typeof validateEvent>;

export type PolarWebhookHandlers = {
  onPayload(payload: PolarWebhookPayload): Promise<void>;
};

export type PolarWebhookContext = {
  project: BillingRealm;
  store: PolarWebhookStore;
  entitlements: PolarEntitlementGrantStore;
  logger?: Pick<BillingLogger, "info" | "warn">;
};

export const createPolarWebhookHandlers = (context: PolarWebhookContext): PolarWebhookHandlers => {
  return {
    onPayload: (payload) => processPolarWebhook(context, payload)
  };
};

export const processPolarWebhook = async (
  context: PolarWebhookContext,
  payload: PolarWebhookPayload
) => {
  const resourceId = polarWebhookResourceId(payload);
  const eventKey = polarWebhookEventKey(payload, resourceId);
  const storedPayload = polarWebhookAuditPayload(payload);

  context.logger?.info("polar_webhook_received", {
    projectSlug: context.project.slug,
    type: payload.type,
    resourceId,
    eventKey
  });

  const claimed = await context.store.claimEvent({
    projectSlug: context.project.slug,
    eventKey,
    eventType: payload.type,
    resourceId,
    occurredAt: payload.timestamp,
    payload: storedPayload
  });
  if (!claimed) {
    context.logger?.info("polar_webhook_duplicate", {
      projectSlug: context.project.slug,
      type: payload.type,
      resourceId
    });
    return;
  }

  const resourceVersion = polarWebhookResourceVersion(
    context.project.slug,
    eventKey,
    payload
  );
  await context.store.withResourceLock(resourceVersion, async () => {
    if (!(await context.store.claimResourceVersion(resourceVersion))) {
      await context.store.completeEvent(context.project.slug, eventKey);
      context.logger?.info("polar_webhook_stale", {
        projectSlug: context.project.slug,
        type: payload.type,
        resourceId
      });
      return;
    }

    try {
      await syncPolarProjection(context, payload, storedPayload);
      await context.store.completeEvent(context.project.slug, eventKey);
    } catch (error) {
      await Promise.all([
        context.store.failEvent(context.project.slug, eventKey),
        context.store.releaseResourceVersion(resourceVersion)
      ]);
      throw error;
    }
  });
};

export const polarWebhookResourceVersion = (
  projectSlug: string,
  eventKey: string,
  payload: PolarWebhookPayload
) => {
  const group = polarWebhookEventGroup(payload.type);
  let resourceType = group;
  let resourceId = polarWebhookResourceId(payload);

  if (group === PolarWebhookEventGroup.BenefitGrant && isBenefitGrantPayload(payload)) {
    if (payload.data.orderId) {
      resourceType = PolarWebhookEventGroup.Order;
      resourceId = payload.data.orderId;
    } else if (payload.data.subscriptionId) {
      resourceType = PolarWebhookEventGroup.Subscription;
      resourceId = payload.data.subscriptionId;
    }
  }

  return {
    projectSlug,
    resourceType,
    resourceId,
    versionKey: `${payload.timestamp.toISOString()}:${String(
      polarWebhookEventPriority(payload)
    ).padStart(3, "0")}`,
    eventKey
  };
};

const polarWebhookEventPriority = (payload: PolarWebhookPayload) => {
  if (
    payload.type === "order.refunded" ||
    payload.type === "benefit_grant.revoked" ||
    (isSubscriptionPayload(payload) && subscriptionInactive(payload.data.status))
  ) {
    return 100;
  }

  return 10;
};

const syncPolarProjection = async (
  context: PolarWebhookContext,
  payload: PolarWebhookPayload,
  storedPayload: unknown
) => {
  const group = polarWebhookEventGroup(payload.type);

  if (group === PolarWebhookEventGroup.Order && isOrderPayload(payload)) {
    await syncOrder(context, payload, storedPayload);
    return;
  }

  if (group === PolarWebhookEventGroup.Subscription && isSubscriptionPayload(payload)) {
    await syncSubscription(context, payload, storedPayload);
    return;
  }

  if (group === PolarWebhookEventGroup.BenefitGrant && isBenefitGrantPayload(payload)) {
    await syncBenefitGrant(context, payload, storedPayload);
    return;
  }

  if (payload.type === "customer.state_changed") {
    await syncCustomerState(context, payload, storedPayload);
    return;
  }

  context.logger?.warn("polar_webhook_projection_skipped", {
    projectSlug: context.project.slug,
    type: payload.type
  });
};

const syncOrder = async (
  context: PolarWebhookContext,
  payload: Extract<PolarWebhookPayload, { data: { paid: boolean; totalAmount: number } }>,
  storedPayload: unknown
) => {
  await context.store.upsertOrder({
    projectSlug: context.project.slug,
    orderId: payload.data.id,
    customerId: payload.data.customerId,
    productId: payload.data.productId,
    subscriptionId: payload.data.subscriptionId,
    status: payload.data.status,
    paid: payload.data.paid,
    totalAmount: payload.data.totalAmount,
    refundedAmount: payload.data.refundedAmount,
    currency: payload.data.currency,
    payload: storedPayload
  });

  if (payload.type !== "order.paid" || !payload.data.productId) {
    if (payload.type === "order.refunded") {
      await context.entitlements.deactivateSource({
        project: context.project,
        sourceType: BillingEntitlementSourceType.PolarOrder,
        sourceId: payload.data.id,
        metadata: storedPayload
      });
    }
    return;
  }

  const userId = payload.data.customer.externalId;
  if (!userId) {
    context.logger?.warn("polar_order_paid_without_external_customer_id", {
      projectSlug: context.project.slug,
      orderId: payload.data.id
    });
    return;
  }

  const granted = await context.entitlements.grantProductEntitlements({
    project: context.project,
    userId,
    productId: payload.data.productId,
    sourceId: payload.data.id,
    metadata: storedPayload
  });

  context.logger?.info("polar_order_entitlements_granted", {
    projectSlug: context.project.slug,
    orderId: payload.data.id,
    userId,
    productId: payload.data.productId,
    granted
  });
};

const syncCustomerState = async (
  context: PolarWebhookContext,
  payload: Extract<PolarWebhookPayload, { type: "customer.state_changed" }>,
  storedPayload: unknown
) => {
  await context.store.upsertCustomerState({
    projectSlug: context.project.slug,
    customerId: payload.data.id,
    externalId: payload.data.externalId,
    payload: storedPayload
  });
};

const syncBenefitGrant = async (
  context: PolarWebhookContext,
  payload: Extract<PolarWebhookPayload, { data: { benefitId: string } }>,
  storedPayload: unknown
) => {
  await context.store.upsertBenefitGrant({
    projectSlug: context.project.slug,
    grantId: payload.data.id,
    customerId: payload.data.customerId,
    benefitId: payload.data.benefitId,
    subscriptionId: payload.data.subscriptionId,
    orderId: payload.data.orderId,
    revoked: payload.type === "benefit_grant.revoked",
    payload: storedPayload
  });

  if (payload.type === "benefit_grant.revoked" && payload.data.orderId) {
    await context.entitlements.deactivateSource({
      project: context.project,
      sourceType: BillingEntitlementSourceType.PolarOrder,
      sourceId: payload.data.orderId,
      metadata: storedPayload
    });
  }
};

const syncSubscription = async (
  context: PolarWebhookContext,
  payload: Extract<PolarWebhookPayload, { data: { cancelAtPeriodEnd: boolean } }>,
  storedPayload: unknown
) => {
  await context.store.upsertSubscription({
    projectSlug: context.project.slug,
    subscriptionId: payload.data.id,
    customerId: payload.data.customerId,
    productId: payload.data.productId,
    status: payload.data.status,
    cancelAtPeriodEnd: payload.data.cancelAtPeriodEnd,
    currentPeriodStart: payload.data.currentPeriodStart,
    currentPeriodEnd: payload.data.currentPeriodEnd,
    endedAt: payload.data.endedAt,
    payload: storedPayload
  });

  if (subscriptionInactive(payload.data.status)) {
    await context.entitlements.deactivateSubscription({
      project: context.project,
      subscriptionId: payload.data.id,
      metadata: storedPayload
    });
  }
};

const subscriptionInactive = (status: string) => {
  return (
    status === SubscriptionStatus.Canceled ||
    status === SubscriptionStatus.IncompleteExpired ||
    status === SubscriptionStatus.PastDue ||
    status === SubscriptionStatus.Unpaid
  );
};

export const polarWebhookEventGroup = (eventType: string) => {
  if (eventType.startsWith("order.")) {
    return PolarWebhookEventGroup.Order;
  }
  if (eventType.startsWith("subscription.")) {
    return PolarWebhookEventGroup.Subscription;
  }
  if (eventType.startsWith("benefit_grant.")) {
    return PolarWebhookEventGroup.BenefitGrant;
  }
  if (eventType.startsWith("customer.")) {
    return PolarWebhookEventGroup.Customer;
  }
  return PolarWebhookEventGroup.Unknown;
};

export const polarWebhookEventKey = (
  payload: Pick<PolarWebhookPayload, "type" | "timestamp">,
  resourceId: string
) => {
  return `${payload.type}:${resourceId}:${payload.timestamp.toISOString()}`;
};

export const polarWebhookResourceId = (payload: Pick<PolarWebhookPayload, "data">) => {
  return payload.data.id;
};

const POLAR_AUDIT_DATA_FIELDS = [
  "benefitId",
  "cancelAtPeriodEnd",
  "currency",
  "currentPeriodEnd",
  "currentPeriodStart",
  "customerId",
  "endedAt",
  "id",
  "orderId",
  "paid",
  "productId",
  "refundedAmount",
  "status",
  "subscriptionId",
  "totalAmount"
];

export const polarWebhookAuditPayload = (payload: PolarWebhookPayload) => {
  const data: Record<string, unknown> = {};
  const payloadData: unknown = payload.data;
  if (isRecord(payloadData)) {
    for (const field of POLAR_AUDIT_DATA_FIELDS) {
      const value = payloadData[field];
      if (isPolarAuditValue(value)) {
        data[field] = value;
      }
    }
  }

  return {
    type: payload.type,
    timestamp: payload.timestamp,
    data
  };
};

const isPolarAuditValue = (value: unknown) => {
  return (
    value === null ||
    value instanceof Date ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
};

const isOrderPayload = (
  payload: PolarWebhookPayload
): payload is Extract<PolarWebhookPayload, { data: { paid: boolean; totalAmount: number } }> => {
  return polarWebhookEventGroup(payload.type) === PolarWebhookEventGroup.Order;
};

const isSubscriptionPayload = (
  payload: PolarWebhookPayload
): payload is Extract<PolarWebhookPayload, { data: { cancelAtPeriodEnd: boolean } }> => {
  return polarWebhookEventGroup(payload.type) === PolarWebhookEventGroup.Subscription;
};

const isBenefitGrantPayload = (
  payload: PolarWebhookPayload
): payload is Extract<PolarWebhookPayload, { data: { benefitId: string } }> => {
  return polarWebhookEventGroup(payload.type) === PolarWebhookEventGroup.BenefitGrant;
};
