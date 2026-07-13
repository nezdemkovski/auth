import type { AdminProfilePatch } from "./model";

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

type ChangePasswordBody = {
  currentPassword?: unknown;
  newPassword?: unknown;
};

type UpdateProfileBody = {
  name?: unknown;
  email?: unknown;
  currentPassword?: unknown;
};

type ResendVerificationBody = {
  email?: unknown;
};

const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const parseChangePasswordInput = (body: ChangePasswordBody) => {
  if (typeof body.currentPassword !== "string" || typeof body.newPassword !== "string") {
    return null;
  }

  return {
    currentPassword: body.currentPassword,
    newPassword: body.newPassword
  };
};

export const parseAdminProfilePatch = (body: UpdateProfileBody) => {
  const patch: AdminProfilePatch = {};

  if (typeof body.name === "string") {
    const trimmed = body.name.trim();
    if (trimmed.length < 1 || trimmed.length > 80) {
      return null;
    }
    patch.name = trimmed;
  }

  if (typeof body.email === "string") {
    const trimmed = body.email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(trimmed) || trimmed.length > 200) {
      return null;
    }
    patch.email = trimmed;
  }

  return patch.name === undefined && patch.email === undefined ? null : patch;
};

export const getProfileCurrentPassword = (body: UpdateProfileBody) => {
  return typeof body.currentPassword === "string" && body.currentPassword.length > 0
    ? body.currentPassword
    : null;
};

export const parseResendVerificationEmail = (body: ResendVerificationBody) => {
  if (typeof body.email !== "string") {
    return null;
  }

  const email = body.email.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) {
    return null;
  }

  return EMAIL_PATTERN.test(email) ? email : null;
};
