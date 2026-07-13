import { booleanField, isRecord, numberField, stringField } from "../shared/validator";

export type BillingUsageSummary = {
  key: string;
  used: number;
  limit: number;
  remaining: number;
  unlimited: boolean;
};

export const parseBillingUsageSummary = (value: unknown): BillingUsageSummary | null => {
  const key = stringField(value, "key");
  const used = numberField(value, "used");
  const limit = numberField(value, "limit");
  const remaining = numberField(value, "remaining");
  const unlimited = booleanField(value, "unlimited");
  if (!key || used === null || limit === null || remaining === null || unlimited === null) {
    return null;
  }
  return { key, used, limit, remaining, unlimited };
};

export const parseBillingUsageSummaryResponse = (value: unknown): BillingUsageSummary | null => {
  if (!isRecord(value)) {
    return null;
  }
  return parseBillingUsageSummary(value.summary);
};
