export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const stringField = (
  value: unknown,
  key: string
): string | null => {
  if (!isRecord(value)) {
    return null;
  }
  const field = value[key];
  return typeof field === "string" ? field : null;
};

export const numberField = (
  value: unknown,
  key: string
): number | null => {
  if (!isRecord(value)) {
    return null;
  }
  const field = value[key];
  return typeof field === "number" && Number.isFinite(field) ? field : null;
};

export const booleanField = (
  value: unknown,
  key: string
): boolean | null => {
  if (!isRecord(value)) {
    return null;
  }
  const field = value[key];
  return typeof field === "boolean" ? field : null;
};
