import { sha256Base64Url } from "@nezdemkovski/auth-platform-crypto";

export const oauthClientSecretStorage = {
  hash: async (clientSecret: string) => sha256Base64Url(clientSecret)
};
