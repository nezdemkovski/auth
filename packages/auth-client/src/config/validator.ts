import type { AuthCrypto } from "../crypto/core";
import type { AuthStorage } from "../storage/core";

export type AuthFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type AuthClientOptions = {
  baseUrl: string;
  realm: string;
  storage?: AuthStorage;
  crypto?: AuthCrypto;
  fetch?: AuthFetcher;
  now?: () => number;
  accessTokenExpirySkewSeconds?: number;
};

export type AuthClientConfig = {
  baseUrl: string;
  realm: string;
  fetch: AuthFetcher;
  now: () => number;
  accessTokenExpirySkewSeconds: number;
};

export const parseAuthClientConfig = (options: AuthClientOptions): AuthClientConfig | null => {
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

  return {
    baseUrl,
    realm,
    fetch: options.fetch ?? ((input, init) => globalThis.fetch(input, init)),
    now: options.now ?? Date.now,
    accessTokenExpirySkewSeconds: options.accessTokenExpirySkewSeconds ?? 30
  };
};
