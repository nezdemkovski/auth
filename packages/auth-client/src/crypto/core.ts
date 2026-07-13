import { AuthClientError, AuthClientErrorCode } from "../errors";

export type AuthCrypto = {
  randomBytes(length: number): Uint8Array;
  sha256(value: string): Promise<Uint8Array>;
};

export const createWebAuthCrypto = (): AuthCrypto => {
  const webCrypto = globalThis.crypto;
  if (!webCrypto?.subtle) {
    throw new AuthClientError(
      AuthClientErrorCode.CryptoUnavailable,
      "Web Crypto is unavailable; provide an AuthCrypto adapter"
    );
  }

  return {
    randomBytes: (length) => webCrypto.getRandomValues(new Uint8Array(length)),
    sha256: async (value) => {
      const digest = await webCrypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
      return new Uint8Array(digest);
    }
  };
};
