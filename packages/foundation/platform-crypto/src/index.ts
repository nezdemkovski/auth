export const randomBase64Url = (byteLength: number) => {
  return base64Url(randomBytes(byteLength));
};

export const randomHex = (byteLength: number) => {
  return toHex(randomBytes(byteLength));
};

export const sha256Base64Url = (value: string) => {
  return new Bun.CryptoHasher("sha256").update(value).digest("base64url");
};

export const sha256Hex = (value: string | Uint8Array) => {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex");
};

const randomBytes = (byteLength: number) => {
  return crypto.getRandomValues(new Uint8Array(byteLength));
};

const base64Url = (bytes: Uint8Array) => {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const toHex = (bytes: Uint8Array) => {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
