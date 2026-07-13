import { isRecord } from "../../runtime/type-guards";

export enum BillingUsageMutation {
  Consume = "consume",
  Reserve = "reserve",
  Commit = "commit",
  Release = "release"
}

export type BillingUsageMutationInput =
  | {
      operation: BillingUsageMutation.Consume;
      subject: string;
      key: string;
      amount: number;
      idempotencyKey: string;
    }
  | {
      operation: BillingUsageMutation.Reserve;
      subject: string;
      key: string;
      amount: number;
      idempotencyKey: string;
    }
  | {
      operation: BillingUsageMutation.Commit;
      subject: string;
      reservationId: string;
    }
  | {
      operation: BillingUsageMutation.Release;
      subject: string;
      reservationId: string;
    };

export const parseBillingUsageMutationOperation = (
  value: unknown
): BillingUsageMutation | null => {
  return Object.values(BillingUsageMutation).find((operation) => operation === value) ?? null;
};

export const parseBillingUsageMutationInput = (input: {
  operation: BillingUsageMutation;
  body: unknown;
  idempotencyKey: unknown;
}): BillingUsageMutationInput | null => {
  if (!isRecord(input.body)) {
    return null;
  }

  const subject = parseSubject(input.body.subject);
  if (!subject) {
    return null;
  }

  if (
    input.operation === BillingUsageMutation.Consume ||
    input.operation === BillingUsageMutation.Reserve
  ) {
    if (
      !validBenefitKey(input.body.key) ||
      !validBillingUsageIdempotencyKey(input.idempotencyKey)
    ) {
      return null;
    }

    const amount = typeof input.body.amount === "number" ? input.body.amount : 1;
    if (!Number.isInteger(amount) || amount < 1 || amount > 1000) {
      return null;
    }

    return {
      operation: input.operation,
      subject,
      key: input.body.key,
      amount,
      idempotencyKey: input.idempotencyKey
    };
  }

  if (typeof input.body.reservationId !== "string") {
    return null;
  }
  const reservationId = input.body.reservationId.trim();
  if (!/^[A-Za-z0-9_-]{16,}$/.test(reservationId)) {
    return null;
  }

  return {
    operation: input.operation,
    subject,
    reservationId
  };
};

export const validBenefitKey = (value: unknown): value is string => {
  return typeof value === "string" && /^[a-z][a-z0-9_]*$/.test(value);
};

export const validBillingUsageIdempotencyKey = (
  value: unknown
): value is string => {
  return (
    typeof value === "string" &&
    value.length >= 16 &&
    value.length <= 128 &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  );
};

const parseSubject = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const subject = value.trim();
  return /^[A-Za-z0-9_-]{1,128}$/.test(subject) ? subject : null;
};
