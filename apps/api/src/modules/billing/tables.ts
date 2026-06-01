import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique
} from "drizzle-orm/pg-core";

export const billingSettings = pgTable("auth_billing_settings", {
  projectSlug: text("project_slug").primaryKey(),
  provider: text("provider").notNull().default("none"),
  enabled: boolean("enabled").notNull().default(false),
  environment: text("environment").notNull().default("sandbox"),
  organizationId: text("organization_id").notNull().default(""),
  accessTokenCipher: text("access_token_cipher").notNull().default(""),
  webhookSecretCipher: text("webhook_secret_cipher").notNull().default(""),
  freeEntitlements: jsonb("free_entitlements").notNull().default([]),
  products: jsonb("products").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const billingWebhookEvents = pgTable(
  "auth_billing_webhook_events",
  {
    projectSlug: text("project_slug").notNull(),
    eventKey: text("event_key").notNull(),
    eventType: text("event_type").notNull(),
    resourceId: text("resource_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb("payload").notNull()
  },
  (table) => [
    primaryKey({
      columns: [table.projectSlug, table.eventKey]
    })
  ]
);

export const billingOrders = pgTable(
  "auth_billing_orders",
  {
    projectSlug: text("project_slug").notNull(),
    orderId: text("order_id").notNull(),
    customerId: text("customer_id").notNull(),
    productId: text("product_id"),
    subscriptionId: text("subscription_id"),
    status: text("status").notNull(),
    paid: boolean("paid").notNull(),
    totalAmount: integer("total_amount").notNull(),
    refundedAmount: integer("refunded_amount").notNull(),
    currency: text("currency").notNull(),
    payload: jsonb("payload").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      columns: [table.projectSlug, table.orderId]
    })
  ]
);

export const billingCustomerStates = pgTable(
  "auth_billing_customer_states",
  {
    projectSlug: text("project_slug").notNull(),
    customerId: text("customer_id").notNull(),
    externalId: text("external_id"),
    payload: jsonb("payload").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      columns: [table.projectSlug, table.customerId]
    })
  ]
);

export const billingBenefitGrants = pgTable(
  "auth_billing_benefit_grants",
  {
    projectSlug: text("project_slug").notNull(),
    grantId: text("grant_id").notNull(),
    customerId: text("customer_id").notNull(),
    benefitId: text("benefit_id").notNull(),
    subscriptionId: text("subscription_id"),
    orderId: text("order_id"),
    revoked: boolean("revoked").notNull(),
    payload: jsonb("payload").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      columns: [table.projectSlug, table.grantId]
    })
  ]
);

export const billingSubscriptions = pgTable(
  "auth_billing_subscriptions",
  {
    projectSlug: text("project_slug").notNull(),
    subscriptionId: text("subscription_id").notNull(),
    customerId: text("customer_id").notNull(),
    productId: text("product_id").notNull(),
    status: text("status").notNull(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull(),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    payload: jsonb("payload").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      columns: [table.projectSlug, table.subscriptionId]
    })
  ]
);

export const billingEntitlementGrants = pgTable(
  "auth_billing_entitlement_grants",
  {
    id: text("id").primaryKey(),
    projectSlug: text("project_slug").notNull(),
    userId: text("user_id").notNull(),
    benefitKey: text("benefit_key").notNull(),
    grantType: text("grant_type").notNull(),
    amount: integer("amount"),
    remaining: integer("remaining"),
    resetPeriod: text("reset_period").notNull(),
    priority: integer("priority").notNull().default(100),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    productSlug: text("product_slug"),
    active: boolean("active").notNull().default(true),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("auth_billing_entitlement_grants_source_key").on(
      table.projectSlug,
      table.userId,
      table.benefitKey,
      table.sourceType,
      table.sourceId
    )
  ]
);

export const billingUsageEvents = pgTable("auth_billing_usage_events", {
  id: text("id").primaryKey(),
  projectSlug: text("project_slug").notNull(),
  userId: text("user_id").notNull(),
  benefitKey: text("benefit_key").notNull(),
  amount: integer("amount").notNull(),
  grantIds: jsonb("grant_ids").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const billingUsageReservations = pgTable("auth_billing_usage_reservations", {
  id: text("id").primaryKey(),
  projectSlug: text("project_slug").notNull(),
  userId: text("user_id").notNull(),
  benefitKey: text("benefit_key").notNull(),
  amount: integer("amount").notNull(),
  grantConsumptions: jsonb("grant_consumptions").notNull(),
  status: text("status").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
