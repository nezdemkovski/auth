import type { ProjectUsersResponse } from "../types";
import { jsonHeaders, readJson } from "./shared";

export async function fetchProjectUsers(project: string): Promise<ProjectUsersResponse> {
  const response = await fetch(`/admin/api/projects/${project}/users`, {
    credentials: "include"
  });
  if (!response.ok) throw new Error("Could not load users");
  return readJson<ProjectUsersResponse>(response);
}

export async function resendVerificationEmail(project: string, email: string): Promise<void> {
  const response = await fetch(
    `/admin/api/projects/${project}/users/resend-verification`,
    {
      method: "POST",
      credentials: "include",
      headers: jsonHeaders,
      body: JSON.stringify({ email })
    }
  );
  if (!response.ok) throw new Error("Could not send verification email");
}

export async function terminateUserSessions(project: string, userId: string): Promise<void> {
  const response = await fetch(
    `/admin/api/projects/${project}/users/${userId}/terminate-sessions`,
    {
      method: "POST",
      credentials: "include"
    }
  );

  if (!response.ok) throw new Error("Could not terminate sessions");
}
