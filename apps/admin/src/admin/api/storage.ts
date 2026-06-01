import type {
  StorageObjectsResponse,
  StorageSettings,
  StorageSettingsPatch,
  UploadResponse
} from "../types";
import { jsonHeaders, readErrorBody, readErrorMessage, readJson } from "./shared";

export async function fetchStorageSettings(project: string): Promise<StorageSettings> {
  const response = await fetch(`/admin/api/projects/${project}/storage`, {
    credentials: "include"
  });
  if (!response.ok) throw new Error("Could not load storage settings");
  return (await readJson<{ settings: StorageSettings }>(response)).settings;
}

export async function fetchStorageObjects(
  project: string
): Promise<StorageObjectsResponse> {
  const response = await fetch(`/admin/api/projects/${project}/storage/objects`, {
    credentials: "include"
  });
  if (!response.ok) throw new Error("Could not load storage objects");
  return readJson<StorageObjectsResponse>(response);
}

export async function updateStorageSettings(input: {
  project: string;
  patch: StorageSettingsPatch;
}): Promise<StorageSettings> {
  const response = await fetch(`/admin/api/projects/${input.project}/storage`, {
    method: "PATCH",
    credentials: "include",
    headers: jsonHeaders,
    body: JSON.stringify(input.patch)
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not save storage settings"));
  }

  return (await readJson<{ settings: StorageSettings }>(response)).settings;
}

export async function uploadProjectIcon(input: {
  project: string;
  file: File;
}): Promise<UploadResponse> {
  const form = new FormData();
  form.set("purpose", "project_icon");
  form.set("file", input.file);

  const response = await fetch(`/admin/api/projects/${input.project}/upload`, {
    method: "POST",
    credentials: "include",
    body: form
  });

  if (!response.ok) {
    const body = await readErrorBody(response);
    if (body?.error === "storage_not_configured") {
      throw new Error("Configure storage before uploading files");
    }
    if (body?.error === "file_too_large") {
      throw new Error("Use an image smaller than 2 MB");
    }
    if (body?.error === "unsupported_file_type") {
      throw new Error("Use PNG, JPG, WebP, GIF, or SVG");
    }
    throw new Error("Could not upload icon");
  }

  return readJson<UploadResponse>(response);
}
