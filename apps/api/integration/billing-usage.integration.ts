import { beforeEach, describe, expect, test } from "bun:test";

import {
  EntitlementGrantType,
  EntitlementResetPeriod,
  BillingProductType,
  type AuthProject,
  type BillingEntitlement,
  type BillingProductMapping
} from "../src/config/projects";
import {
  commitBillingUsageReservation,
  createPolarEntitlementGrantStore,
  readBillingUsageSummary,
  releaseBillingUsageReservation,
  reserveBillingUsage
} from "../src/modules/billing/usage-store";
import { createPolarWebhookStore } from "../src/modules/billing/webhook-store";
import { processPolarWebhook } from "../src/modules/billing/webhooks";
import { seedIntegrationRealm } from "./seed";
import {
  integrationAdminDbOptions,
  createIntegrationApp,
  resetAndBootstrapIntegrationDatabase
} from "./setup";
import { DIRECT_CLIENT_IP_HEADER } from "../src/http/security";
import { isRecord } from "../src/runtime/type-guards";
import {
  polarOrderPaidPayload,
  polarOrderRefundedPayload,
  polarSubscriptionCanceledPayload
} from "./polar-fixtures";

const benefitKey = "integration_credits";
const userId = "user_integration";

describe("billing usage integration", () => {
  beforeEach(async () => {
    await resetAndBootstrapIntegrationDatabase();
  });

  test("reserves, releases, and commits credits against Postgres", async () => {
    const project = await prepareBillingProject(credits(5));

    await expectSummary(project, {
      used: 0,
      limit: 5,
      remaining: 5
    });

    const firstReservation = await reserveBillingUsage({
      ...integrationAdminDbOptions,
      project,
      userId,
      key: benefitKey,
      amount: 2
    });
    expect(firstReservation.allowed).toBe(true);
    expect(typeof firstReservation.reservationId).toBe("string");
    expect(firstReservation.summary).toMatchObject({
      used: 2,
      limit: 5,
      remaining: 3
    });

    const released = await releaseBillingUsageReservation({
      ...integrationAdminDbOptions,
      project,
      userId,
      reservationId: firstReservation.reservationId ?? ""
    });
    expect(released?.summary).toMatchObject({
      used: 0,
      limit: 5,
      remaining: 5
    });

    const secondReservation = await reserveBillingUsage({
      ...integrationAdminDbOptions,
      project,
      userId,
      key: benefitKey,
      amount: 2
    });
    expect(secondReservation.allowed).toBe(true);

    const committed = await commitBillingUsageReservation({
      ...integrationAdminDbOptions,
      project,
      userId,
      reservationId: secondReservation.reservationId ?? ""
    });
    expect(committed?.summary).toMatchObject({
      used: 2,
      limit: 5,
      remaining: 3
    });

    const releaseCommitted = await releaseBillingUsageReservation({
      ...integrationAdminDbOptions,
      project,
      userId,
      reservationId: secondReservation.reservationId ?? ""
    });
    expect(releaseCommitted).toBeNull();

    await expectSummary(project, {
      used: 2,
      limit: 5,
      remaining: 3
    });
  });

  test("does not over-reserve the same credit under concurrent requests", async () => {
    const project = await prepareBillingProject(credits(1));

    const reservations = await Promise.all([
      reserveBillingUsage({
        ...integrationAdminDbOptions,
        project,
        userId,
        key: benefitKey,
        amount: 1
      }),
      reserveBillingUsage({
        ...integrationAdminDbOptions,
        project,
        userId,
        key: benefitKey,
        amount: 1
      })
    ]);

    expect(reservations.filter((reservation) => reservation.allowed)).toHaveLength(1);
    expect(reservations.filter((reservation) => !reservation.allowed)).toHaveLength(1);

    await expectSummary(project, {
      used: 1,
      limit: 1,
      remaining: 0
    });
  });

  test("returns expired reservations to the available balance", async () => {
    const project = await prepareBillingProject(credits(1));

    const reservation = await reserveBillingUsage({
      ...integrationAdminDbOptions,
      project,
      userId,
      key: benefitKey,
      amount: 1,
      ttlSeconds: 1
    });
    expect(reservation.allowed).toBe(true);

    await expectSummary(project, {
      used: 1,
      limit: 1,
      remaining: 0
    });

    await Bun.sleep(1100);

    await expectSummary(project, {
      used: 0,
      limit: 1,
      remaining: 1
    });
  });

  test("lets an authenticated app reserve, release, and commit credits through the public API", async () => {
    const project = await prepareBillingProject(credits(2));
    const { app, close } = await createIntegrationApp();

    try {
      const cookie = await signUpAndReadCookie({
        app,
        projectSlug: project.slug,
        origin: project.appUrl,
        email: "billing-user@integration.test",
        password: "correct horse battery staple"
      });

      await expectApiSummary(app, project, cookie, {
        used: 0,
        limit: 2,
        remaining: 2
      });

      const firstReservation = await billingApi(app, project, cookie, "reserve", {
        key: benefitKey,
        amount: 1
      });
      expect(firstReservation.status).toBe(200);
      const firstBody = await firstReservation.json();
      const firstReservationId = reservationId(firstBody);
      expect(firstReservationId.length).toBeGreaterThan(0);

      await expectApiSummary(app, project, cookie, {
        used: 1,
        limit: 2,
        remaining: 1
      });

      const release = await billingApi(app, project, cookie, "release", {
        reservationId: firstReservationId
      });
      expect(release.status).toBe(200);

      await expectApiSummary(app, project, cookie, {
        used: 0,
        limit: 2,
        remaining: 2
      });

      const secondReservation = await billingApi(app, project, cookie, "reserve", {
        key: benefitKey,
        amount: 2
      });
      expect(secondReservation.status).toBe(200);
      const secondReservationId = reservationId(await secondReservation.json());

      const commit = await billingApi(app, project, cookie, "commit", {
        reservationId: secondReservationId
      });
      expect(commit.status).toBe(200);

      await expectApiSummary(app, project, cookie, {
        used: 2,
        limit: 2,
        remaining: 0
      });

      const overLimit = await billingApi(app, project, cookie, "reserve", {
        key: benefitKey,
        amount: 1
      });
      expect(overLimit.status).toBe(402);
      expect(await overLimit.json()).toMatchObject({
        allowed: false,
        summary: {
          key: benefitKey,
          used: 2,
          limit: 2,
          remaining: 0
        }
      });
    } finally {
      await close();
    }
  });

  test("grants paid Polar order entitlements once and removes them after refund", async () => {
    const productId = "prod_integration_credits";
    const orderId = "order_integration_credits";
    const product = creditProduct({
      productId,
      entitlements: [credits(50)]
    });
    const project = await seedIntegrationRealm({
      slug: "integration-billing",
      schema: "integration_billing_auth",
      name: "Integration Billing",
      products: [product]
    });
    const context = {
      project,
      store: createPolarWebhookStore(integrationAdminDbOptions),
      entitlements: createPolarEntitlementGrantStore(integrationAdminDbOptions)
    };
    const paidPayload = polarOrderPaidPayload({
      orderId,
      productId,
      userId
    });

    await processPolarWebhook(context, paidPayload);
    await processPolarWebhook(context, paidPayload);

    await expectSummary(project, {
      used: 0,
      limit: 50,
      remaining: 50
    });

    const reservation = await reserveBillingUsage({
      ...integrationAdminDbOptions,
      project,
      userId,
      key: benefitKey,
      amount: 3
    });
    expect(reservation.allowed).toBe(true);

    const committed = await commitBillingUsageReservation({
      ...integrationAdminDbOptions,
      project,
      userId,
      reservationId: reservation.reservationId ?? ""
    });
    expect(committed?.summary).toMatchObject({
      used: 3,
      limit: 50,
      remaining: 47
    });

    await processPolarWebhook(
      context,
      polarOrderRefundedPayload({
        orderId,
        productId,
        userId
      })
    );

    await expectSummary(project, {
      used: 0,
      limit: 0,
      remaining: 0
    });
  });

  test("removes subscription-backed entitlements when Polar cancels the subscription", async () => {
    const productId = "prod_integration_subscription";
    const orderId = "order_integration_subscription";
    const subscriptionId = "sub_integration_subscription";
    const product = creditProduct({
      productId,
      entitlements: [credits(25)]
    });
    const project = await seedIntegrationRealm({
      slug: "integration-billing",
      schema: "integration_billing_auth",
      name: "Integration Billing",
      products: [product]
    });
    const context = {
      project,
      store: createPolarWebhookStore(integrationAdminDbOptions),
      entitlements: createPolarEntitlementGrantStore(integrationAdminDbOptions)
    };

    await processPolarWebhook(
      context,
      polarOrderPaidPayload({
        orderId,
        productId,
        userId,
        subscriptionId
      })
    );
    await expectSummary(project, {
      used: 0,
      limit: 25,
      remaining: 25
    });

    await processPolarWebhook(
      context,
      polarSubscriptionCanceledPayload({
        subscriptionId,
        productId,
        userId
      })
    );

    await expectSummary(project, {
      used: 0,
      limit: 0,
      remaining: 0
    });
  });

  test("keeps identical user IDs and benefit keys isolated by realm", async () => {
    const firstProductId = "prod_first_realm";
    const secondProductId = "prod_second_realm";
    const firstProject = await seedIntegrationRealm({
      slug: "first-billing",
      schema: "first_billing_auth",
      name: "First Billing",
      products: [
        creditProduct({
          productId: firstProductId,
          entitlements: [credits(10)]
        })
      ]
    });
    const secondProject = await seedIntegrationRealm({
      slug: "second-billing",
      schema: "second_billing_auth",
      name: "Second Billing",
      products: [
        creditProduct({
          productId: secondProductId,
          entitlements: [credits(20)]
        })
      ]
    });
    const firstContext = {
      project: firstProject,
      store: createPolarWebhookStore(integrationAdminDbOptions),
      entitlements: createPolarEntitlementGrantStore(integrationAdminDbOptions)
    };

    await processPolarWebhook(
      firstContext,
      polarOrderPaidPayload({
        orderId: "order_first_realm",
        productId: firstProductId,
        userId
      })
    );

    await expectSummary(firstProject, {
      used: 0,
      limit: 10,
      remaining: 10
    });
    await expectSummary(secondProject, {
      used: 0,
      limit: 0,
      remaining: 0
    });
  });
});

const prepareBillingProject = async (freeEntitlement: BillingEntitlement) => {
  return seedIntegrationRealm({
    slug: "integration-billing",
    schema: "integration_billing_auth",
    name: "Integration Billing",
    freeEntitlements: [freeEntitlement]
  });
};

const credits = (amount: number): BillingEntitlement => {
  return {
    key: benefitKey,
    grantType: EntitlementGrantType.OneTimeCredits,
    amount,
    resetPeriod: EntitlementResetPeriod.Never,
    priority: 100
  };
};

const creditProduct = (input: {
  productId: string;
  entitlements: BillingEntitlement[];
}): BillingProductMapping => {
  return {
    slug: "integration-credit-pack",
    name: "Integration Credit Pack",
    description: "Credits for integration tests",
    productId: input.productId,
    type: BillingProductType.OneTime,
    active: true,
    entitlements: input.entitlements
  };
};

const expectSummary = async (
  project: AuthProject,
  expected: {
    used: number;
    limit: number;
    remaining: number;
  }
) => {
  const summary = await readBillingUsageSummary({
    ...integrationAdminDbOptions,
    project,
    userId,
    key: benefitKey
  });

  expect(summary).toMatchObject({
    key: benefitKey,
    unlimited: false,
    ...expected
  });
};

const signUpAndReadCookie = async (options: {
  app: Awaited<ReturnType<typeof createIntegrationApp>>["app"];
  projectSlug: string;
  origin: string;
  email: string;
  password: string;
}) => {
  const response = await options.app.request(
    `/api/${options.projectSlug}/auth/sign-up/email`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: options.origin,
        [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
      },
      body: JSON.stringify({
        name: "Billing User",
        email: options.email,
        password: options.password
      })
    }
  );

  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  expect(cookie).toContain("auth_integration-billing");
  return cookie;
};

const billingApi = (
  app: Awaited<ReturnType<typeof createIntegrationApp>>["app"],
  project: AuthProject,
  cookie: string,
  action: "reserve" | "release" | "commit",
  body: Record<string, unknown>
) => {
  return app.request(`/api/${project.slug}/billing/usage/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: project.appUrl,
      [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
    },
    body: JSON.stringify(body)
  });
};

const expectApiSummary = async (
  app: Awaited<ReturnType<typeof createIntegrationApp>>["app"],
  project: AuthProject,
  cookie: string,
  expected: {
    used: number;
    limit: number;
    remaining: number;
  }
) => {
  const response = await app.request(
    `/api/${project.slug}/billing/usage/summary?key=${benefitKey}`,
    {
      headers: {
        Cookie: cookie,
        Origin: project.appUrl,
        [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
      }
    }
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    summary: {
      key: benefitKey,
      unlimited: false,
      ...expected
    }
  });
};

const reservationId = (body: unknown) => {
  if (!isRecord(body) || typeof body.reservationId !== "string") {
    throw new Error("Expected reservation ID");
  }

  return body.reservationId;
};
