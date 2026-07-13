import { describe, expect, test } from "bun:test";

import {
  BillingUsageErrorKind,
  mutateBillingUsage
} from "../usage-core";
import { DEFAULT_PROJECT_BILLING } from "../model";
import { BillingUsageMutation } from "../usage-validator";

describe("billing usage service", () => {
  test("rejects an unknown opaque subject before touching quota persistence", async () => {
    await expect(
      mutateBillingUsage({
        databaseUrl: "postgres://auth:auth@127.0.0.1:5432/auth",
        adminProject: { schema: "auth_admin" },
        project: {
          slug: "demo",
          billing: DEFAULT_PROJECT_BILLING
        },
        subjects: {
          exists: async () => false
        },
        input: {
          operation: BillingUsageMutation.Reserve,
          subject: "user_demo",
          key: "demo_credits",
          amount: 1,
          idempotencyKey: "request-00000001"
        }
      })
    ).rejects.toMatchObject({
      kind: BillingUsageErrorKind.UnknownSubject
    });
  });
});
