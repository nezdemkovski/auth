import type {
  ProjectSettingsPatch,
  ProjectSummary,
  ProjectUsersResponse,
  ProjectsResponse,
  ViewState,
  MeResponse
} from "./types";

export const jsonHeaders = {
  "Content-Type": "application/json"
};

export async function fetchProjects(): Promise<ProjectsResponse> {
  const response = await fetch("/admin/api/projects", { credentials: "include" });
  if (!response.ok) throw new Error("Could not load projects");
  return (await response.json()) as ProjectsResponse;
}

export async function fetchProjectUsers(project: string): Promise<ProjectUsersResponse> {
  const response = await fetch(`/admin/api/projects/${project}/users`, {
    credentials: "include"
  });
  if (!response.ok) throw new Error("Could not load users");
  return (await response.json()) as ProjectUsersResponse;
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

export async function updateProjectSettings(
  project: string,
  patch: ProjectSettingsPatch
): Promise<ProjectSummary> {
  const response = await fetch(`/admin/api/projects/${project}`, {
    method: "PATCH",
    credentials: "include",
    headers: jsonHeaders,
    body: JSON.stringify(patch)
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Could not save project settings");
  }

  return ((await response.json()) as { project: ProjectSummary }).project;
}

export async function loadSession(): Promise<ViewState> {
  const response = await fetch("/admin/api/me", { credentials: "include" });
  if (response.status === 401) return { status: "signed-out" };
  if (!response.ok) {
    return { status: "signed-out", error: "Admin API is unavailable" };
  }
  const me = (await response.json()) as MeResponse;
  return me.mustChangePassword
    ? { status: "force-change", me }
    : { status: "dashboard", me };
}

export async function signOut(): Promise<void> {
  await fetch("/admin/api/auth/sign-out", {
    method: "POST",
    credentials: "include"
  }).catch(() => {});
}
