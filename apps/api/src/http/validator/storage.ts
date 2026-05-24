import type { MediaUploadPurpose } from "../../storage/media";

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
