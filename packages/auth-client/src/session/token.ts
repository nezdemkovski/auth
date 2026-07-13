export const accessTokenExpiresAt = (token: string) => {
  try {
    const payload = token.split(".")[1];
    if (!payload) {
      return 0;
    }
    const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
    const decoded: unknown = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
    if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
      return 0;
    }
    const expiresAt = Reflect.get(decoded, "exp");
    return typeof expiresAt === "number" && Number.isFinite(expiresAt) ? expiresAt : 0;
  } catch {
    return 0;
  }
};
