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
      await encryptionKey(secret, context),
      encoder.encode(value)
    )
  );
  return `v1:${base64UrlEncode(iv)}:${base64UrlEncode(encrypted)}`;
};

export const decryptSecretValue = async (
  value: string,
  secret: string,
  context: string
) => {
  if (!value) {
    return "";
  }

  const [version, iv, encrypted] = value.split(":");
  if (version !== "v1" || !iv || !encrypted) {
    throw new Error("Invalid encrypted secret");
  }

  const payload = base64UrlDecode(encrypted);
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64UrlDecode(iv),
      additionalData: encoder.encode(context)
    },
    await encryptionKey(secret, context),
    payload
  );

  return decoder.decode(decrypted);
};

const encryptionKey = async (secret: string, context: string) => {
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
      info: encoder.encode(context)
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
