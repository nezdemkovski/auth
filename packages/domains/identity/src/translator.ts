import type { IdentityUserResponse, IdentityUserRow } from "./model";

export const identityUserResponse = (
  user: IdentityUserRow
): IdentityUserResponse => {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    banned: user.banned ?? false,
    emailVerified: user.emailVerified,
    createdAt: toIsoString(user.createdAt),
    updatedAt: toIsoString(user.updatedAt),
    sessionCount: Number(user.sessionCount)
  };
};

const toIsoString = (value: Date | string) => {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};
