import { MediaUploadError } from "@nezdemkovski/auth-storage";

type DomainError = Error & {
  code: string;
  status: number;
};

export const mediaUploadError = (error: unknown) => {
  if (error instanceof MediaUploadError) {
    const status = error.code === "storage_not_configured" ? 409 : 400;
    return Response.json(
      {
        error: error.code,
        message: error.message
      },
      { status }
    );
  }

  throw error;
};

export const domainErrorResponse = (error: DomainError) => {
  return Response.json(
    {
      error: error.code,
      message: error.message
    },
    { status: error.status }
  );
};
