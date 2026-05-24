export function randomBase64Url(byteLength: number): string {
  return base64Url(randomBytes(byteLength));
}

export function randomHex(byteLength: number): string {
  return toHex(randomBytes(byteLength));
}

export function sha256Base64Url(value: string): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("base64url");
}

export function sha256Hex(value: string | Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex");
}

function randomBytes(byteLength: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(byteLength));
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
