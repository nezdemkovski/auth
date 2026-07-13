import { booleanField, stringField } from "../shared/validator";

export type RealmIdentity = {
  id: string;
  realm: string;
  name: string;
  image: string | null;
  email: string | null;
  emailVerified: boolean;
  telegramId: string | null;
};

export const parseRealmIdentity = (value: unknown): RealmIdentity | null => {
  const id = stringField(value, "sub");
  const realm = stringField(value, "project");
  if (!id || !realm) {
    return null;
  }

  return {
    id,
    realm,
    name: stringField(value, "name") ?? "",
    image: stringField(value, "image"),
    email: stringField(value, "email"),
    emailVerified: booleanField(value, "email_verified") ?? false,
    telegramId: stringField(value, "telegram_id")
  };
};
