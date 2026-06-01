import type { WebhooksOptions } from "@polar-sh/better-auth";
import { SubscriptionStatus } from "@polar-sh/sdk/models/components/subscriptionstatus";

import type { AuthProject } from "../../config/projects";
import { logInfo, logWarn } from "../../runtime/logger";
import type { PolarEntitlementGrantStore } from "./usage-store";
import type { PolarWebhookStore } from "./webhook-store";

export enum PolarWebhookEventGroup {
  BenefitGrant = "benefit_grant",
  Customer = "customer",
  Order = "order",
  Subscription = "subscription",
  Unknown = "unknown"
}

export type PolarWebhookHandlers = Omit<WebhooksOptions, "secret">;

type PolarWebhookPayload = Parameters<NonNullable<WebhooksOptions["onPayload"]>>[0];

type PolarWebhookContext = {
  project: AuthProject;
  store: PolarWebhookStore;
  entitlements: PolarEntitlementGrantStore;
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

  logInfo("polar_webhook_received", {
    projectSlug: context.project.slug,
    type: payload.type,
    resourceId,
    eventKey
  });

  await syncPolarProjection(context, payload);

  const processed = await context.store.recordEvent({
    projectSlug: context.project.slug,
    eventKey,
    eventType: payload.type,
    resourceId,
    occurredAt: payload.timestamp,
    payload
  });
  if (!processed) {
    logInfo("polar_webhook_duplicate", {
      projectSlug: context.project.slug,
      type: payload.type,
      resourceId
    });
  }
};

const syncPolarProjection = async (
  context: PolarWebhookContext,
  payload: PolarWebhookPayload
) => {
  const group = polarWebhookEventGroup(payload.type);

  if (group === PolarWebhookEventGroup.Order && isOrderPayload(payload)) {
    await syncOrder(context, payload);
    return;
  }

  if (group === PolarWebhookEventGroup.Subscription && isSubscriptionPayload(payload)) {
    await syncSubscription(context, payload);
    return;
  }

  if (group === PolarWebhookEventGroup.BenefitGrant && isBenefitGrantPayload(payload)) {
    await syncBenefitGrant(context, payload);
    return;
  }

  if (payload.type === "customer.state_changed") {
    await syncCustomerState(context, payload);
    return;
  }

  logWarn("polar_webhook_projection_skipped", {
    projectSlug: context.project.slug,
    type: payload.type
  });
};

const syncOrder = async (
  context: PolarWebhookContext,
  payload: Extract<PolarWebhookPayload, { data: { paid: boolean; totalAmount: number } }>
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
    payload
  });

  if (payload.type !== "order.paid" || !payload.data.productId) {
    if (payload.type === "order.refunded") {
      await context.entitlements.deactivateSource({
        project: context.project,
        sourceType: "polar_order",
        sourceId: payload.data.id,
        metadata: payload
      });
    }
    return;
  }

  const userId = payload.data.customer.externalId;
  if (!userId) {
    logWarn("polar_order_paid_without_external_customer_id", {
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
    metadata: payload
  });

  logInfo("polar_order_entitlements_granted", {
    projectSlug: context.project.slug,
    orderId: payload.data.id,
    userId,
    productId: payload.data.productId,
    granted
  });
};

const syncCustomerState = async (
  context: PolarWebhookContext,
  payload: Extract<PolarWebhookPayload, { type: "customer.state_changed" }>
) => {
  await context.store.upsertCustomerState({
    projectSlug: context.project.slug,
    customerId: payload.data.id,
    externalId: payload.data.externalId,
    payload
  });
};

const syncBenefitGrant = async (
  context: PolarWebhookContext,
  payload: Extract<PolarWebhookPayload, { data: { benefitId: string } }>
) => {
  await context.store.upsertBenefitGrant({
    projectSlug: context.project.slug,
    grantId: payload.data.id,
    customerId: payload.data.customerId,
    benefitId: payload.data.benefitId,
    subscriptionId: payload.data.subscriptionId,
    orderId: payload.data.orderId,
    revoked: payload.type === "benefit_grant.revoked",
    payload
  });

  if (payload.type === "benefit_grant.revoked" && payload.data.orderId) {
    await context.entitlements.deactivateSource({
      project: context.project,
      sourceType: "polar_order",
      sourceId: payload.data.orderId,
      metadata: payload
    });
  }
};

const syncSubscription = async (
  context: PolarWebhookContext,
  payload: Extract<PolarWebhookPayload, { data: { cancelAtPeriodEnd: boolean } }>
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
    payload
  });

  if (subscriptionInactive(payload.data.status)) {
    await context.entitlements.deactivateSubscription({
      project: context.project,
      subscriptionId: payload.data.id,
      metadata: payload
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
