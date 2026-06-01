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
import { updateBillingSettings } from "../src/modules/billing/store";
import { createPolarWebhookStore } from "../src/modules/billing/webhook-store";
import { processPolarWebhook } from "../src/modules/billing/webhooks";
import { seedIntegrationRealm } from "./seed";
import {
  integrationAdminDbOptions,
  createIntegrationApp,
  integrationEncryptionSecret,
  resetAndBootstrapIntegrationDatabase,
  signUpIntegrationUser
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

  test("grants signup credits lazily and stacks paid credit packs on the same key", async () => {
    const productId = "prod_integration_signup_stack";
    const project = await seedIntegrationRealm({
      slug: "integration-billing",
      schema: "integration_billing_auth",
      name: "Integration Billing",
      freeEntitlements: [credits(5)],
      products: [
        creditProduct({
          productId,
          entitlements: [credits(50)]
        })
      ]
    });
    const context = {
      project,
      store: createPolarWebhookStore(integrationAdminDbOptions),
      entitlements: createPolarEntitlementGrantStore(integrationAdminDbOptions)
    };

    await expectSummary(project, {
      used: 0,
      limit: 5,
      remaining: 5
    });

    await processPolarWebhook(
      context,
      polarOrderPaidPayload({
        orderId: "order_integration_signup_stack",
        productId,
        userId
      })
    );

    await expectSummary(project, {
      used: 0,
      limit: 55,
      remaining: 55
    });

    const reservation = await reserveBillingUsage({
      ...integrationAdminDbOptions,
      project,
      userId,
      key: benefitKey,
      amount: 7
    });
    expect(reservation.allowed).toBe(true);
    const committed = await commitBillingUsageReservation({
      ...integrationAdminDbOptions,
      project,
      userId,
      reservationId: reservation.reservationId ?? ""
    });

    expect(committed?.summary).toMatchObject({
      used: 7,
      limit: 55,
      remaining: 48
    });
  });

  test("reconciles changed signup grants without refunding spent credits", async () => {
    const project = await prepareBillingProject(credits(5));
    const reservation = await reserveBillingUsage({
      ...integrationAdminDbOptions,
      project,
      userId,
      key: benefitKey,
      amount: 2
    });
    expect(reservation.allowed).toBe(true);
    await commitBillingUsageReservation({
      ...integrationAdminDbOptions,
      project,
      userId,
      reservationId: reservation.reservationId ?? ""
    });

    const increased = await updateProjectBilling(project, [credits(10)]);
    await expectSummary(increased, {
      used: 2,
      limit: 10,
      remaining: 8
    });

    const decreased = await updateProjectBilling(project, [credits(1)]);
    await expectSummary(decreased, {
      used: 1,
      limit: 1,
      remaining: 0
    });
  });

  test("keeps separate signup benefit keys isolated for the same user", async () => {
    const exportsKey = "integration_exports";
    const project = await seedIntegrationRealm({
      slug: "integration-billing",
      schema: "integration_billing_auth",
      name: "Integration Billing",
      freeEntitlements: [credits(5), creditsFor(exportsKey, 2)]
    });

    const reservation = await reserveBillingUsage({
      ...integrationAdminDbOptions,
      project,
      userId,
      key: benefitKey,
      amount: 3
    });
    expect(reservation.allowed).toBe(true);
    await commitBillingUsageReservation({
      ...integrationAdminDbOptions,
      project,
      userId,
      reservationId: reservation.reservationId ?? ""
    });

    await expectSummary(project, {
      used: 3,
      limit: 5,
      remaining: 2
    });
    await expectSummary(project, {
      key: exportsKey,
      used: 0,
      limit: 2,
      remaining: 2
    });
  });

  test("prevents another user from releasing or committing a reservation", async () => {
    const project = await prepareBillingProject(credits(5));
    const reservation = await reserveBillingUsage({
      ...integrationAdminDbOptions,
      project,
      userId,
      key: benefitKey,
      amount: 1
    });
    expect(reservation.allowed).toBe(true);

    const reservationIdValue = reservation.reservationId ?? "";
    await expect(
      releaseBillingUsageReservation({
        ...integrationAdminDbOptions,
        project,
        userId: "different_user",
        reservationId: reservationIdValue
      })
    ).resolves.toBeNull();
    await expect(
      commitBillingUsageReservation({
        ...integrationAdminDbOptions,
        project,
        userId: "different_user",
        reservationId: reservationIdValue
      })
    ).resolves.toBeNull();

    await expectSummary(project, {
      used: 1,
      limit: 5,
      remaining: 4
    });

    const released = await releaseBillingUsageReservation({
      ...integrationAdminDbOptions,
      project,
      userId,
      reservationId: reservationIdValue
    });
    expect(released?.summary).toMatchObject({
      used: 0,
      limit: 5,
      remaining: 5
    });
  });

  test("allows unlimited signup benefits without reducing balance", async () => {
    const project = await prepareBillingProject({
      key: benefitKey,
      grantType: EntitlementGrantType.Lifetime,
      amount: null,
      resetPeriod: EntitlementResetPeriod.Never,
      priority: 100
    });

    await expectUnlimitedSummary(project);

    const reservation = await reserveBillingUsage({
      ...integrationAdminDbOptions,
      project,
      userId,
      key: benefitKey,
      amount: 100
    });
    expect(reservation.allowed).toBe(true);
    await commitBillingUsageReservation({
      ...integrationAdminDbOptions,
      project,
      userId,
      reservationId: reservation.reservationId ?? ""
    });

    await expectUnlimitedSummary(project);
  });

  test.each([
    EntitlementGrantType.OneTimeCredits,
    EntitlementGrantType.RecurringQuota,
    EntitlementGrantType.Metered
  ])("applies numeric %s signup grants from Postgres", async (grantType) => {
    const project = await prepareBillingProject({
      key: benefitKey,
      grantType,
      amount: 5,
      resetPeriod:
        grantType === EntitlementGrantType.RecurringQuota
          ? EntitlementResetPeriod.Monthly
          : EntitlementResetPeriod.Never,
      priority: 100
    });

    await expectSummary(project, {
      used: 0,
      limit: 5,
      remaining: 5
    });

    const reservation = await reserveBillingUsage({
      ...integrationAdminDbOptions,
      project,
      userId,
      key: benefitKey,
      amount: 2
    });
    expect(reservation.allowed).toBe(true);

    await commitBillingUsageReservation({
      ...integrationAdminDbOptions,
      project,
      userId,
      reservationId: reservation.reservationId ?? ""
    });

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
      const { cookie } = await signUpIntegrationUser({
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

  test("does not grant entitlements for inactive product mappings", async () => {
    const productId = "prod_integration_inactive";
    const project = await seedIntegrationRealm({
      slug: "integration-billing",
      schema: "integration_billing_auth",
      name: "Integration Billing",
      products: [
        {
          ...creditProduct({
            productId,
            entitlements: [credits(50)]
          }),
          active: false
        }
      ]
    });
    const context = {
      project,
      store: createPolarWebhookStore(integrationAdminDbOptions),
      entitlements: createPolarEntitlementGrantStore(integrationAdminDbOptions)
    };

    await processPolarWebhook(
      context,
      polarOrderPaidPayload({
        orderId: "order_integration_inactive",
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

  test("keeps duplicate paid webhook deliveries idempotent in Postgres", async () => {
    const productId = "prod_integration_duplicate";
    const project = await seedIntegrationRealm({
      slug: "integration-billing",
      schema: "integration_billing_auth",
      name: "Integration Billing",
      products: [
        creditProduct({
          productId,
          entitlements: [credits(50)]
        })
      ]
    });
    const context = {
      project,
      store: createPolarWebhookStore(integrationAdminDbOptions),
      entitlements: createPolarEntitlementGrantStore(integrationAdminDbOptions)
    };
    const payload = polarOrderPaidPayload({
      orderId: "order_integration_duplicate",
      productId,
      userId
    });

    await processPolarWebhook(context, payload);
    await processPolarWebhook(context, payload);

    await expectSummary(project, {
      used: 0,
      limit: 50,
      remaining: 50
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
  return creditsFor(benefitKey, amount);
};

const creditsFor = (key: string, amount: number): BillingEntitlement => {
  return {
    key,
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

const updateProjectBilling = async (
  project: AuthProject,
  freeEntitlements: BillingEntitlement[]
) => {
  const billing = await updateBillingSettings({
    ...integrationAdminDbOptions,
    project,
    encryptionSecret: integrationEncryptionSecret,
    patch: {
      ...project.billing,
      freeEntitlements
    }
  });

  return {
    ...project,
    billing
  };
};

const expectSummary = async (
  project: AuthProject,
  expected: {
    key?: string;
    used: number;
    limit: number;
    remaining: number;
  }
) => {
  const key = expected.key ?? benefitKey;
  const summary = await readBillingUsageSummary({
    ...integrationAdminDbOptions,
    project,
    userId,
    key
  });

  expect(summary).toMatchObject({
    key,
    unlimited: false,
    ...expected
  });
};

const expectUnlimitedSummary = async (project: AuthProject) => {
  const summary = await readBillingUsageSummary({
    ...integrationAdminDbOptions,
    project,
    userId,
    key: benefitKey
  });

  expect(summary).toMatchObject({
    key: benefitKey,
    used: 0,
    limit: -1,
    remaining: -1,
    unlimited: true
  });
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
