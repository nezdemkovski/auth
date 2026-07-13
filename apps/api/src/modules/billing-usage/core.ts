import type { BillingUsageSummary } from "@nezdemkovski/auth-contracts";

import type { RegisteredProject } from "../../auth/registry";
import type { AdminDatabaseOptions } from "../../db/admin-pool";
import {
  billingUsageSubjectExists,
  commitBillingUsageReservation,
  consumeBillingUsage,
  readBillingUsageSummary,
  releaseBillingUsageReservation,
  reserveBillingUsage
} from "./store";
import {
  BillingUsageMutation,
  type BillingUsageMutationInput
} from "./validator";

export enum BillingUsageErrorKind {
  UnknownSubject = "unknown_subject",
  UnknownReservation = "unknown_reservation"
}

export class BillingUsageError extends Error {
  constructor(readonly kind: BillingUsageErrorKind) {
    super(kind);
    this.name = "BillingUsageError";
  }
}

type BillingUsageOptions = AdminDatabaseOptions & {
  registered: RegisteredProject;
};

type ConsumeResult = Awaited<ReturnType<typeof consumeBillingUsage>>;
type ReserveResult = Awaited<ReturnType<typeof reserveBillingUsage>>;
type CommitResult = NonNullable<
  Awaited<ReturnType<typeof commitBillingUsageReservation>>
>;
type ReleaseResult = NonNullable<
  Awaited<ReturnType<typeof releaseBillingUsageReservation>>
>;

export type BillingUsageMutationResult =
  | {
      operation: BillingUsageMutation.Consume;
      value: ConsumeResult;
    }
  | {
      operation: BillingUsageMutation.Reserve;
      value: ReserveResult;
    }
  | {
      operation: BillingUsageMutation.Commit;
      value: CommitResult;
    }
  | {
      operation: BillingUsageMutation.Release;
      value: ReleaseResult;
    };

export const readUserBillingUsageSummary = async (
  options: BillingUsageOptions & {
    subject: string;
    key: string;
  }
): Promise<BillingUsageSummary> => {
  return readBillingUsageSummary({
    databaseUrl: options.databaseUrl,
    adminProject: options.adminProject,
    adminDb: options.adminDb,
    project: options.registered.project,
    userId: options.subject,
    key: options.key
  });
};

export const mutateBillingUsage = async (
  options: BillingUsageOptions & {
    input: BillingUsageMutationInput;
  }
): Promise<BillingUsageMutationResult> => {
  if (
    !(await billingUsageSubjectExists(
      options.registered.projectDb,
      options.input.subject
    ))
  ) {
    throw new BillingUsageError(BillingUsageErrorKind.UnknownSubject);
  }

  const common = {
    databaseUrl: options.databaseUrl,
    adminProject: options.adminProject,
    adminDb: options.adminDb,
    project: options.registered.project,
    userId: options.input.subject
  };

  if (options.input.operation === BillingUsageMutation.Consume) {
    return {
      operation: options.input.operation,
      value: await consumeBillingUsage({
        ...common,
        key: options.input.key,
        amount: options.input.amount,
        idempotencyKey: options.input.idempotencyKey
      })
    };
  }
  if (options.input.operation === BillingUsageMutation.Reserve) {
    return {
      operation: options.input.operation,
      value: await reserveBillingUsage({
        ...common,
        key: options.input.key,
        amount: options.input.amount,
        idempotencyKey: options.input.idempotencyKey
      })
    };
  }
  if (options.input.operation === BillingUsageMutation.Commit) {
    const value = await commitBillingUsageReservation({
      ...common,
      reservationId: options.input.reservationId
    });
    if (!value) {
      throw new BillingUsageError(BillingUsageErrorKind.UnknownReservation);
    }

    return {
      operation: options.input.operation,
      value
    };
  }

  const value = await releaseBillingUsageReservation({
    ...common,
    reservationId: options.input.reservationId
  });
  if (!value) {
    throw new BillingUsageError(BillingUsageErrorKind.UnknownReservation);
  }

  return {
    operation: options.input.operation,
    value
  };
};
