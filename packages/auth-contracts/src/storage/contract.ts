import { isRecord, stringField } from "../shared/validator";

export enum MediaUploadPurpose {
  UserAvatar = "user_avatar"
}

export type UserAvatarResponse = {
  image: string | null;
};

export const parseUserAvatarResponse = (value: unknown): UserAvatarResponse | null => {
  if (!isRecord(value) || !isRecord(value.user)) {
    return null;
  }
  const image = value.user.image;
  if (image !== null && typeof image !== "string") {
    return null;
  }
  return { image: stringField(value.user, "image") };
};
