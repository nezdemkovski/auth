import { MediaUploadError } from "../../modules/storage/media";

export const mediaUploadError = (error: unknown) => {
  if (error instanceof MediaUploadError) {
    const status = error.code === "storage_not_configured" ? 409 : 400;
    return Response.json({ error: error.code }, { status });
  }

  throw error;
};
