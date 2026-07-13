export type AuthPlatformIdentity = {
  issuer: string;
  subject: string;
};

export type AuthPlatformIdentityOptions = {
  issuer: string;
  providerId?: string;
};

export const readAuthPlatformIdentity = (
  accounts: unknown,
  options: AuthPlatformIdentityOptions
): AuthPlatformIdentity | null => {
  if (!Array.isArray(accounts)) {
    return null;
  }

  const providerId = options.providerId?.trim() || "auth-platform";
  const issuer = options.issuer.trim().replace(/\/$/, "");
  if (!issuer) {
    return null;
  }

  for (const account of accounts) {
    if (!isRecord(account)) {
      continue;
    }

    if (account.providerId !== providerId) {
      continue;
    }

    const subject = typeof account.accountId === "string"
      ? account.accountId.trim()
      : "";
    if (!subject) {
      continue;
    }

    return {
      issuer,
      subject
    };
  }

  return null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
