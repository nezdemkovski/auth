import { isRecord, stringField } from "../shared/validator.js";
import {
  authorizedFetch,
  type AccessTokenSource
} from "../shared/authorized-fetch.js";

export enum MediaUploadPurpose {
  UserAvatar = "user_avatar"
}

export type UserAvatarResponse = {
  image: string | null;
};

export type StorageClient = {
  uploadAvatar(file: Blob, fileName?: string): Promise<string>;
  deleteAvatar(): Promise<void>;
};

export type StorageClientConfiguration = {
  issuer: string;
  auth: AccessTokenSource;
  fetch?: typeof fetch;
};

export const parseUserAvatarResponse = (
  value: unknown
): UserAvatarResponse | null => {
  if (!isRecord(value) || !isRecord(value.user)) {
    return null;
  }
  const image = value.user.image;
  if (image !== null && typeof image !== "string") {
    return null;
  }
  return { image: stringField(value.user, "image") };
};

export const createStorageClient = (
  configuration: StorageClientConfiguration
): StorageClient => {
  const issuer = configuration.issuer.trim().replace(/\/+$/, "");
  const fetcher = configuration.fetch ?? fetch;
  const request = (init: RequestInit) =>
    authorizedFetch(configuration.auth, fetcher, `${issuer}/upload`, init);

  return {
    uploadAvatar: async (file, fileName = "avatar.jpg") => {
      const form = new FormData();
      form.append("purpose", MediaUploadPurpose.UserAvatar);
      form.append("file", file, fileName);
      const response = await request({ method: "POST", body: form });
      const body: unknown = await response.json().catch(() => null);
      const avatar = parseUserAvatarResponse(body);
      if (!response.ok || !avatar?.image) {
        throw new Error(`Avatar upload failed with status ${response.status}`);
      }
      return avatar.image;
    },
    deleteAvatar: async () => {
      const response = await request({ method: "DELETE" });
      if (!response.ok) {
        throw new Error(`Avatar delete failed with status ${response.status}`);
      }
    }
  };
};
