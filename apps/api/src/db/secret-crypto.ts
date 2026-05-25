const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const encryptSecretValue = async (
  value: string,
  secret: string,
  context: string
) => {
  if (!value) {
    return "";
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: encoder.encode(context)
      },
      await encryptionKey(secret),
      encoder.encode(value)
    )
  );
  const tagOffset = encrypted.byteLength - 16;
  const ciphertext = encrypted.slice(0, tagOffset);
  const tag = encrypted.slice(tagOffset);

  return `v1:${base64UrlEncode(iv)}:${base64UrlEncode(tag)}:${base64UrlEncode(ciphertext)}`;
};

export const decryptSecretValue = async (
  value: string,
  secret: string,
  context: string
) => {
  if (!value) {
    return "";
  }

  const [version, iv, tag, encrypted] = value.split(":");
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new Error("Invalid encrypted secret");
  }

  const ciphertext = base64UrlDecode(encrypted);
  const authTag = base64UrlDecode(tag);
  const payload = new Uint8Array(ciphertext.byteLength + authTag.byteLength);
  payload.set(ciphertext);
  payload.set(authTag, ciphertext.byteLength);

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64UrlDecode(iv),
      additionalData: encoder.encode(context)
    },
    await encryptionKey(secret),
    payload
  );

  return decoder.decode(decrypted);
};

const encryptionKey = async (secret: string) => {
  const rootKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "HKDF",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("auth-encryption-v1"),
      info: encoder.encode("secret-value")
    },
    rootKey,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
};

const base64UrlEncode = (value: Uint8Array) => {
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
};

const base64UrlDecode = (value: string) => {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  const binary = atob(padded.replaceAll("-", "+").replaceAll("_", "/"));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};
