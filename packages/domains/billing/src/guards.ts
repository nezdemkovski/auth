export const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

export const isEnumValue = <T extends Record<string, string>>(
  values: T,
  value: unknown
): value is T[keyof T] => {
  return typeof value === "string" && Object.values(values).includes(value);
};
