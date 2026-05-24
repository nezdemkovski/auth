export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

export type AdminProfilePatch = {
  name?: string;
  email?: string;
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

export function parseChangePasswordInput(
  body: ChangePasswordBody
): ChangePasswordInput | null {
  if (typeof body.currentPassword !== "string" || typeof body.newPassword !== "string") {
    return null;
  }

  return {
    currentPassword: body.currentPassword,
    newPassword: body.newPassword
  };
}

export function parseAdminProfilePatch(body: UpdateProfileBody): AdminProfilePatch | null {
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
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ||
      trimmed.length > 200
    ) {
      return null;
    }
    patch.email = trimmed;
  }

  return patch.name === undefined && patch.email === undefined ? null : patch;
}

export function getProfileCurrentPassword(body: UpdateProfileBody): string | null {
  return typeof body.currentPassword === "string" && body.currentPassword.length > 0
    ? body.currentPassword
    : null;
}
