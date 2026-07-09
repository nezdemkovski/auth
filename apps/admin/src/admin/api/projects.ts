import type {
  CreateProjectInput,
  ProjectSettingsPatch,
  ProjectSummary,
  ProjectsResponse
} from "../types";
import { adminFetch, jsonHeaders, readErrorBody, readErrorMessage, readJson } from "./shared";

export async function fetchProjects(): Promise<ProjectsResponse> {
  const response = await adminFetch("/admin/api/projects", { credentials: "include" });
  if (!response.ok) throw new Error("Could not load projects");
  return readJson<ProjectsResponse>(response);
}

export async function createProject(input: CreateProjectInput): Promise<ProjectSummary> {
  const response = await adminFetch("/admin/api/projects", {
    method: "POST",
    credentials: "include",
    headers: jsonHeaders,
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const body = await readErrorBody(response);
    if (body?.error === "project_exists") {
      throw new Error("A project with this slug already exists");
    }
    throw new Error(body?.message ?? "Could not create project");
  }

  return (await readJson<{ project: ProjectSummary }>(response)).project;
}

export async function updateProjectSettings(
  project: string,
  patch: ProjectSettingsPatch
): Promise<ProjectSummary> {
  const response = await adminFetch(`/admin/api/projects/${project}`, {
    method: "PATCH",
    credentials: "include",
    headers: jsonHeaders,
    body: JSON.stringify(patch)
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not save project settings"));
  }

  return (await readJson<{ project: ProjectSummary }>(response)).project;
}
