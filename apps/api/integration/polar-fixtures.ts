import type { CustomerIndividual } from "@polar-sh/sdk/models/components/customerindividual";
import type { Order } from "@polar-sh/sdk/models/components/order";
import { OrderBillingReason } from "@polar-sh/sdk/models/components/orderbillingreason";

import type { processPolarWebhook } from "@nezdemkovski/auth-billing";

type PolarWebhookPayload = Parameters<typeof processPolarWebhook>[1];

export const polarOrderPaidPayload = (input: {
  orderId: string;
  productId: string;
  userId: string;
  subscriptionId?: string;
}) => {
  const payload: PolarWebhookPayload = {
    type: "order.paid",
    timestamp: new Date("2026-06-01T12:00:00.000Z"),
    data: orderData({
      status: "paid",
      refundedAmount: 0,
      orderId: input.orderId,
      productId: input.productId,
      userId: input.userId,
      subscriptionId: input.subscriptionId
    })
  };

  return payload;
};

export const polarOrderRefundedPayload = (input: {
  orderId: string;
  productId: string;
  userId: string;
  subscriptionId?: string;
}) => {
  const payload: PolarWebhookPayload = {
    type: "order.refunded",
    timestamp: new Date("2026-06-01T12:10:00.000Z"),
    data: orderData({
      status: "refunded",
      refundedAmount: 1000,
      orderId: input.orderId,
      productId: input.productId,
      userId: input.userId,
      subscriptionId: input.subscriptionId
    })
  };

  return payload;
};

export const polarSubscriptionCanceledPayload = (input: {
  subscriptionId: string;
  productId: string;
  userId: string;
}) => {
  const payload: PolarWebhookPayload = {
    type: "subscription.updated",
    timestamp: new Date("2026-06-01T12:20:00.000Z"),
    data: {
      createdAt: new Date("2026-06-01T12:00:00.000Z"),
      modifiedAt: null,
      id: input.subscriptionId,
      amount: 1000,
      currency: "eur",
      recurringInterval: "month",
      recurringIntervalCount: 1,
      status: "canceled",
      currentPeriodStart: new Date("2026-06-01T12:00:00.000Z"),
      currentPeriodEnd: new Date("2026-07-01T12:00:00.000Z"),
      trialStart: null,
      trialEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: new Date("2026-06-01T12:20:00.000Z"),
      startedAt: new Date("2026-06-01T12:00:00.000Z"),
      endsAt: new Date("2026-06-01T12:20:00.000Z"),
      endedAt: new Date("2026-06-01T12:20:00.000Z"),
      customerId: "customer_integration",
      productId: input.productId,
      discountId: null,
      checkoutId: null,
      seats: null,
      customerCancellationReason: null,
      customerCancellationComment: null,
      metadata: {},
      customFieldData: {},
      customer: customerData(input.userId),
      product: {
        id: input.productId,
        createdAt: new Date("2026-06-01T12:00:00.000Z"),
        modifiedAt: null,
        trialInterval: null,
        trialIntervalCount: null,
        name: "Integration Subscription",
        description: "",
        visibility: "public",
        recurringInterval: "month",
        recurringIntervalCount: 1,
        isRecurring: true,
        isArchived: false,
        organizationId: "org_integration",
        metadata: {},
        prices: [],
        benefits: [],
        medias: [],
        attachedCustomFields: []
      },
      discount: null,
      prices: [],
      meters: [],
      pendingUpdate: null
    }
  };

  return payload;
};

const orderData = (input: {
  status: "paid" | "refunded";
  refundedAmount: number;
  orderId: string;
  productId: string;
  userId: string;
  subscriptionId?: string;
}): Order => {
  return {
    id: input.orderId,
    createdAt: new Date("2026-06-01T12:00:00.000Z"),
    modifiedAt: null,
    status: input.status,
    paid: true,
    subtotalAmount: 1000,
    discountAmount: 0,
    netAmount: 1000,
    taxAmount: 0,
    totalAmount: 1000,
    appliedBalanceAmount: 0,
    dueAmount: 0,
    refundedAmount: input.refundedAmount,
    refundedTaxAmount: 0,
    currency: "eur",
    billingReason: OrderBillingReason.Purchase,
    billingName: null,
    billingAddress: null,
    invoiceNumber: "INV-1",
    isInvoiceGenerated: true,
    seats: null,
    customerId: "customer_integration",
    productId: input.productId,
    discountId: null,
    subscriptionId: input.subscriptionId ?? null,
    checkoutId: null,
    metadata: {},
    customFieldData: {},
    platformFeeAmount: 0,
    platformFeeCurrency: null,
    customer: customerData(input.userId),
    product: null,
    discount: null,
    subscription: null,
    items: [],
    description: "Integration credit pack"
  };
};

const customerData = (userId: string): CustomerIndividual => {
  return {
    id: "customer_integration",
    createdAt: new Date("2026-06-01T12:00:00.000Z"),
    modifiedAt: null,
    metadata: {},
    externalId: userId,
    email: "customer@integration.test",
    emailVerified: true,
    type: "individual",
    name: "Integration Customer",
    billingAddress: null,
    taxId: null,
    locale: "en",
    organizationId: "org_integration",
    deletedAt: null,
    avatarUrl: ""
  };
};
