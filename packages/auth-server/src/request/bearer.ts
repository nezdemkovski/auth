export const extractBearerToken = (headerValue: string | null | undefined) => {
  if (!headerValue) {
    return null;
  }
  const parts = headerValue.trim().split(/\s+/);
  if (parts.length !== 2) {
    return null;
  }
  const [scheme, token] = parts;
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
};
