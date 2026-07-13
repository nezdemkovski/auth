export const requiredValue = (value: string, field: string) => {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${field} is required`);
  }

  return normalized;
};

export const normalizeIdentifier = (value: string, field: string) => {
  const normalized = requiredValue(value, field).replace(/\/$/, "");

  try {
    const url = new URL(normalized);
    if (url.hash || url.search) {
      throw new Error();
    }
  } catch {
    throw new Error(`${field} must be an absolute URI without query or fragment`);
  }

  return normalized;
};
