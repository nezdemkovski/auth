import { describe, expect, test } from "bun:test";
import type { BenefitGrantCustomWebhook } from "@polar-sh/sdk/models/components/benefitgrantcustomwebhook";
import type { CustomerIndividual } from "@polar-sh/sdk/models/components/customerindividual";
import type { Order } from "@polar-sh/sdk/models/components/order";
import { OrderBillingReason } from "@polar-sh/sdk/models/components/orderbillingreason";

import {
  BillingEnvironment,
  BillingProvider,
  type BillingRealm
} from "../model";
import type { PolarEntitlementGrantStore } from "../usage-store";
import type { PolarWebhookStore } from "../webhook-store";
import {
  polarWebhookAuditPayload,
  polarWebhookEventKey,
  processPolarWebhook
} from "../webhooks";

const project: BillingRealm = {
  slug: "demo",
  billing: {
    provider: BillingProvider.Polar,
    enabled: true,
    environment: BillingEnvironment.Sandbox,
    organizationId: "",
    accessToken: "polar-token",
    webhookSecret: "webhook-secret",
    freeEntitlements: [],
    products: []
  }
};

const createStore = () => {
  const eventKeys: string[] = [];
  const resourceVersions = new Map<string, { versionKey: string; eventKey: string }>();
  const orders: string[] = [];
  const revokedSources: string[] = [];
  const revokedSubscriptions: string[] = [];
  const grantedSources: string[] = [];
  const storedPayloads: unknown[] = [];
  const store: PolarWebhookStore = {
    withResourceLock: async (_input, operation) => operation(),
    claimEvent: async (input) => {
      storedPayloads.push(input.payload);
      if (eventKeys.includes(input.eventKey)) {
        return false;
      }
      eventKeys.push(input.eventKey);
      return true;
    },
    claimResourceVersion: async (input) => {
      const key = `${input.projectSlug}:${input.resourceType}:${input.resourceId}`;
      const current = resourceVersions.get(key);
      if (current && current.versionKey >= input.versionKey) {
        return false;
      }
      resourceVersions.set(key, {
        versionKey: input.versionKey,
        eventKey: input.eventKey
      });
      return true;
    },
    releaseResourceVersion: async (input) => {
      const key = `${input.projectSlug}:${input.resourceType}:${input.resourceId}`;
      if (resourceVersions.get(key)?.eventKey === input.eventKey) {
        resourceVersions.delete(key);
      }
    },
    completeEvent: async () => {},
    failEvent: async (_projectSlug, eventKey) => {
      const index = eventKeys.indexOf(eventKey);
      if (index >= 0) {
        eventKeys.splice(index, 1);
      }
    },
    upsertOrder: async (input) => {
      orders.push(input.orderId);
      storedPayloads.push(input.payload);
    },
    upsertCustomerState: async () => {},
    upsertBenefitGrant: async () => {},
    upsertSubscription: async () => {},
    close: async () => {}
  };
  const entitlements: PolarEntitlementGrantStore = {
    grantProductEntitlements: async (input) => {
      grantedSources.push(input.sourceId);
      return 1;
    },
    deactivateSource: async (input) => {
      revokedSources.push(`${input.sourceType}:${input.sourceId}`);
      return 1;
    },
    deactivateSubscription: async (input) => {
      revokedSubscriptions.push(input.subscriptionId);
      return 1;
    }
  };

  return {
    eventKeys,
    orders,
    revokedSources,
    revokedSubscriptions,
    grantedSources,
    storedPayloads,
    store,
    entitlements
  };
};

describe("billing webhooks", () => {
  test("builds a stable idempotency key from event type, resource, and timestamp", () => {
    expect(
      polarWebhookEventKey(
        {
          type: "order.paid",
          timestamp: new Date("2026-06-01T12:00:00.000Z")
        },
        "order_123"
      )
    ).toBe("order.paid:order_123:2026-06-01T12:00:00.000Z");
  });

  test("persists only the explicit billing audit projection", async () => {
    const state = createStore();

    await processPolarWebhook(
      {
        project,
        store: state.store,
        entitlements: state.entitlements
      },
      orderPaidPayload()
    );

    const persisted = JSON.stringify(state.storedPayloads);
    expect(persisted).not.toContain("customer@example.com");
    expect(persisted).not.toContain("Customer");
    expect(persisted).not.toContain("billingAddress");
    expect(persisted).not.toContain("metadata");
    expect(persisted).toContain("customer_123");
    expect(persisted).toContain("2026-06-01T12:00:00.000Z");
    expect(
      polarWebhookAuditPayload(orderPaidPayload()).data
    ).not.toHaveProperty("customer");
  });

  test("releases event and resource claims when projection fails", async () => {
    const state = createStore();
    state.entitlements.grantProductEntitlements = async () => {
      throw new Error("projection failed");
    };

    await expect(
      processPolarWebhook(
        {
          project,
          store: state.store,
          entitlements: state.entitlements
        },
        orderPaidPayload()
      )
    ).rejects.toThrow("projection failed");

    expect(state.orders).toEqual(["order_123"]);
    expect(state.eventKeys).toEqual([]);
  });

  test("grants entitlements from paid orders and skips duplicate event records", async () => {
    const state = createStore();
    const payload = orderPaidPayload();
    const context = {
      project,
      store: state.store,
      entitlements: state.entitlements
    };

    await processPolarWebhook(context, payload);
    await processPolarWebhook(context, payload);

    expect(state.grantedSources).toEqual(["order_123"]);
    expect(state.eventKeys).toEqual([
      "order.paid:order_123:2026-06-01T12:00:00.000Z"
    ]);
  });

  test("does not regrant an order when an older paid event arrives after refund", async () => {
    const state = createStore();
    const context = {
      project,
      store: state.store,
      entitlements: state.entitlements
    };

    await processPolarWebhook(context, orderRefundedPayload());
    await processPolarWebhook(context, orderPaidPayload());

    expect(state.revokedSources).toEqual(["polar_order:order_123"]);
    expect(state.grantedSources).toEqual([]);
    expect(state.orders).toEqual(["order_123"]);
  });

  test("deactivates order grants when Polar revokes the backing event", async () => {
    const state = createStore();

    await processPolarWebhook(
      {
        project,
        store: state.store,
        entitlements: state.entitlements
      },
      benefitGrantRevokedPayload()
    );

    expect(state.revokedSources).toEqual(["polar_order:order_123"]);
  });

  test("deactivates order grants when Polar refunds an order", async () => {
    const state = createStore();

    await processPolarWebhook(
      {
        project,
        store: state.store,
        entitlements: state.entitlements
      },
      orderRefundedPayload()
    );

    expect(state.revokedSources).toEqual(["polar_order:order_123"]);
  });

  test("deactivates subscription grants when Polar marks a subscription inactive", async () => {
    const state = createStore();

    await processPolarWebhook(
      {
        project,
        store: state.store,
        entitlements: state.entitlements
      },
      subscriptionCanceledPayload()
    );

    expect(state.revokedSubscriptions).toEqual(["sub_123"]);
  });
});

const orderPaidPayload = (): Parameters<typeof processPolarWebhook>[1] => ({
  type: "order.paid",
  timestamp: new Date("2026-06-01T12:00:00.000Z"),
  data: orderData("paid", 0)
});

const benefitGrantRevokedPayload = (): Parameters<typeof processPolarWebhook>[1] => ({
  type: "benefit_grant.revoked",
  timestamp: new Date("2026-06-01T12:00:00.000Z"),
  data: benefitGrantCustomData()
});

const benefitGrantCustomData = (): BenefitGrantCustomWebhook => {
  return {
    id: "grant_123",
    createdAt: new Date("2026-06-01T12:00:00.000Z"),
    modifiedAt: null,
    grantedAt: new Date("2026-06-01T12:00:00.000Z"),
    isGranted: false,
    revokedAt: new Date("2026-06-01T12:00:00.000Z"),
    isRevoked: true,
    subscriptionId: null,
    orderId: "order_123",
    customerId: "customer_123",
    memberId: null,
    benefitId: "benefit_123",
    error: null,
    customer: customerData(),
    member: null,
    benefit: {
      id: "benefit_123",
      createdAt: new Date("2026-06-01T12:00:00.000Z"),
      modifiedAt: null,
      type: "custom",
      description: "Credits",
      selectable: true,
      deletable: true,
      isDeleted: false,
      organizationId: "org_123",
      metadata: {},
      properties: {
        note: null
      }
    },
    properties: {},
    previousProperties: null
  };
};

const orderRefundedPayload = (): Parameters<typeof processPolarWebhook>[1] => ({
  type: "order.refunded",
  timestamp: new Date("2026-06-01T12:00:00.000Z"),
  data: orderData("refunded", 1000)
});

const orderData = (status: "paid" | "refunded", refundedAmount: number): Order => {
  return {
    id: "order_123",
    createdAt: new Date("2026-06-01T12:00:00.000Z"),
    modifiedAt: null,
    status,
    paid: true,
    subtotalAmount: 1000,
    discountAmount: 0,
    netAmount: 1000,
    taxAmount: 0,
    totalAmount: 1000,
    appliedBalanceAmount: 0,
    dueAmount: 0,
    refundedAmount,
    refundedTaxAmount: 0,
    currency: "eur",
    billingReason: OrderBillingReason.Purchase,
    billingName: null,
    billingAddress: null,
    invoiceNumber: "INV-1",
    isInvoiceGenerated: true,
    receiptNumber: "REC-1",
    seats: null,
    customerId: "customer_123",
    productId: "prod_123",
    discountId: null,
    subscriptionId: null,
    checkoutId: null,
    metadata: {},
    customFieldData: {},
    platformFeeAmount: 0,
    platformFeeCurrency: null,
    customer: customerData(),
    product: null,
    discount: null,
    subscription: null,
    items: [],
    description: "Credit pack",
    refundableAmount: Math.max(0, 1000 - refundedAmount),
    refundableTaxAmount: 0
  };
};

const customerData = (): CustomerIndividual => ({
  id: "customer_123",
  createdAt: new Date("2026-06-01T12:00:00.000Z"),
  modifiedAt: null,
  metadata: {},
  externalId: "user_123",
  email: "customer@example.com",
  emailVerified: true,
  type: "individual",
  name: "Customer",
  billingAddress: null,
  taxId: null,
  locale: "en",
  organizationId: "org_123",
  deletedAt: null,
  avatarUrl: ""
});

const subscriptionCanceledPayload = (): Parameters<typeof processPolarWebhook>[1] => ({
  type: "subscription.updated",
  timestamp: new Date("2026-06-01T12:00:00.000Z"),
  data: {
    createdAt: new Date("2026-06-01T12:00:00.000Z"),
    modifiedAt: null,
    id: "sub_123",
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
    canceledAt: new Date("2026-06-01T12:00:00.000Z"),
    startedAt: new Date("2026-06-01T12:00:00.000Z"),
    endsAt: new Date("2026-06-01T12:00:00.000Z"),
    endedAt: new Date("2026-06-01T12:00:00.000Z"),
    customerId: "customer_123",
    productId: "prod_123",
    discountId: null,
    checkoutId: null,
    seats: null,
    customerCancellationReason: null,
    customerCancellationComment: null,
    metadata: {},
    customFieldData: {},
    customer: customerData(),
    product: {
      id: "prod_123",
      createdAt: new Date("2026-06-01T12:00:00.000Z"),
      modifiedAt: null,
      trialInterval: null,
      trialIntervalCount: null,
      name: "Subscription",
      description: "",
      visibility: "public",
      recurringInterval: "month",
      recurringIntervalCount: 1,
      isRecurring: true,
      isArchived: false,
      organizationId: "org_123",
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
});
