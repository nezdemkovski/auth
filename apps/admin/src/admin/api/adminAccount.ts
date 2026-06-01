import type { MeResponse } from "../types";
import { jsonHeaders, readErrorBody, readJson, UnauthorizedError } from "./shared";

export async function fetchMe(): Promise<MeResponse> {
  const response = await fetch("/admin/api/me", { credentials: "include" });
  if (response.status === 401) throw new UnauthorizedError();
  if (!response.ok) throw new Error("Admin API is unavailable");
  return readJson<MeResponse>(response);
}

export async function signInAdmin(input: {
  email: string;
  password: string;
}): Promise<void> {
  const response = await fetch("/api/admin/auth/sign-in/email", {
    method: "POST",
    credentials: "include",
    headers: jsonHeaders,
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw new Error("Invalid email or password");
  }
}

export async function updateAdminProfile(patch: {
  name?: string;
  email?: string;
  currentPassword?: string;
}): Promise<void> {
  const response = await fetch("/admin/api/profile", {
    method: "PATCH",
    credentials: "include",
    headers: jsonHeaders,
    body: JSON.stringify(patch)
  });
  if (!response.ok) {
    const data = await readErrorBody(response);
    if (data?.error === "email_in_use") throw new Error("Email is already in use");
    if (data?.error === "invalid_email") throw new Error("Invalid email address");
    if (data?.error === "invalid_name") throw new Error("Invalid name");
    if (data?.error === "current_password_required") {
      throw new Error("Current password is required to change email");
    }
    if (data?.error === "invalid_password") throw new Error("Current password is incorrect");
    if (data?.error === "email_service_disabled") {
      throw new Error("Configure email delivery before changing email");
    }
    if (data?.error === "no_changes") throw new Error("Nothing to save");
    throw new Error("Could not save profile");
  }
}

export async function changeAdminPassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const response = await fetch("/admin/api/change-password", {
    method: "POST",
    credentials: "include",
    headers: jsonHeaders,
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    if (response.status === 400) {
      throw new Error("Use a password with at least 12 characters");
    }
    throw new Error("Could not change password");
  }
}

export async function signOut(): Promise<void> {
  await fetch("/api/admin/auth/sign-out", {
    method: "POST",
    credentials: "include"
  }).catch(() => {});
}
