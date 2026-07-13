export const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

export const stringField = (value: unknown, field: string) => {
  if (!isRecord(value)) {
    return null;
  }
  const fieldValue = value[field];
  return typeof fieldValue === "string" ? fieldValue : null;
};

export const numberField = (value: unknown, field: string) => {
  if (!isRecord(value)) {
    return null;
  }
  const fieldValue = value[field];
  return typeof fieldValue === "number" && Number.isFinite(fieldValue) ? fieldValue : null;
};

export const booleanField = (value: unknown, field: string) => {
  if (!isRecord(value)) {
    return null;
  }
  const fieldValue = value[field];
  return typeof fieldValue === "boolean" ? fieldValue : null;
};
