import type { UserInfoResponse } from "oauth4webapi";

import type { AuthSession } from "./index.js";

export const authSessionFromUserInfo = (
  userInfo: UserInfoResponse | Record<string, unknown>
): AuthSession => {
  if (typeof userInfo.sub !== "string" || !userInfo.sub) {
    throw new Error("The authorization server returned user info without a subject");
  }

  return {
    user: {
      id: userInfo.sub,
      ...(typeof userInfo.name === "string" ? { name: userInfo.name } : {}),
      ...(typeof userInfo.email === "string" ? { email: userInfo.email } : {}),
      ...(typeof userInfo.email_verified === "boolean"
        ? { emailVerified: userInfo.email_verified }
        : {}),
      ...(typeof userInfo.picture === "string" ? { image: userInfo.picture } : {})
    }
  };
};

export const safeReturnTo = (returnTo: string | undefined, location: URL) => {
  if (!returnTo) {
    return `${location.pathname}${location.search}${location.hash}`;
  }

  const resolved = new URL(returnTo, location.origin);
  if (resolved.origin !== location.origin) {
    throw new Error("returnTo must point to the current application");
  }

  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
};

export const browserRedirectUri = (
  configuredRedirectUri: string | undefined,
  location: URL
) => configuredRedirectUri ?? `${location.origin}/auth/callback`;

export const parseStoredJson = (value: string | null): unknown => {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
