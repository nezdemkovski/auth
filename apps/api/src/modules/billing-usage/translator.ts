import { ErrorCode } from "../../runtime/error-codes";
import {
  BillingUsageError,
  BillingUsageErrorKind,
  type BillingUsageMutationResult
} from "./core";
import { BillingUsageMutation } from "./validator";

export const billingUsageMutationResponse = (
  result: BillingUsageMutationResult
): {
  body: BillingUsageMutationResult["value"];
  status: 200 | 402;
} => {
  if (
    result.operation === BillingUsageMutation.Consume ||
    result.operation === BillingUsageMutation.Reserve
  ) {
    return {
      body: result.value,
      status: result.value.allowed ? 200 : 402
    };
  }

  return {
    body: result.value,
    status: 200
  };
};

export const billingUsageFailureResponse = (
  error: unknown
): {
  body: { error: ErrorCode };
  status: 404;
} | null => {
  if (!(error instanceof BillingUsageError)) {
    return null;
  }

  if (error.kind === BillingUsageErrorKind.UnknownSubject) {
    return {
      body: { error: ErrorCode.UnknownSubject },
      status: 404
    };
  }

  return {
    body: { error: ErrorCode.UnknownReservation },
    status: 404
  };
};
