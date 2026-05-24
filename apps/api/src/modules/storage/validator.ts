import type { MediaUploadPurpose } from "./media";
import type { StorageSettingsPatch } from "./settings-store";

export type MediaUploadRequest = {
  purpose: MediaUploadPurpose;
  file: File;
};

export async function parseMediaUploadRequest(
  form: FormData,
  expectedPurpose: MediaUploadPurpose
): Promise<MediaUploadRequest | null> {
  const purpose = form.get("purpose");
  const file = form.get("file");

  if (purpose !== expectedPurpose || !(file instanceof File)) {
    return null;
  }

  return {
    purpose,
    file
  };
}

type StorageSettingsBody = Partial<Record<keyof StorageSettingsPatch, unknown>>;

export function parseStorageSettingsPatch(
  body: StorageSettingsBody
): StorageSettingsPatch | null {
  if (typeof body.provider !== "string" || typeof body.enabled !== "boolean") {
    return null;
  }

  const patch: StorageSettingsPatch = {
    provider: body.provider as StorageSettingsPatch["provider"],
    enabled: body.enabled,
    endpoint: typeof body.endpoint === "string" ? body.endpoint.trim() : "",
    region: typeof body.region === "string" ? body.region.trim() || "auto" : "auto",
    bucket: typeof body.bucket === "string" ? body.bucket.trim() : "",
    publicBaseUrl:
      typeof body.publicBaseUrl === "string" ? body.publicBaseUrl.trim() : ""
  };

  if (typeof body.accessKeyId === "string" && body.accessKeyId.trim()) {
    patch.accessKeyId = body.accessKeyId.trim();
  }
  if (typeof body.secretAccessKey === "string" && body.secretAccessKey.trim()) {
    patch.secretAccessKey = body.secretAccessKey.trim();
  }

  return patch;
}
