import type { JWTVerifyGetKey } from "jose";

export type RealmAuthOptions = {
  baseUrl: string;
  realm: string;
  keyResolver?: JWTVerifyGetKey;
};

export type RealmAuthConfig = {
  baseUrl: string;
  realm: string;
  issuer: string;
  jwksUrl: URL;
  keyResolver?: JWTVerifyGetKey;
};

export const parseRealmAuthConfig = (options: RealmAuthOptions): RealmAuthConfig | null => {
  const baseUrl = options.baseUrl.trim().replace(/\/+$/, "");
  const realm = options.realm.trim();
  if (!baseUrl || !realm || !/^[a-z0-9][a-z0-9-]*$/.test(realm)) {
    return null;
  }
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
  } catch {
    return null;
  }
  const issuer = `${baseUrl}/api/${realm}`;
  return {
    baseUrl,
    realm,
    issuer,
    jwksUrl: new URL(`${issuer}/.well-known/jwks.json`),
    keyResolver: options.keyResolver
  };
};
