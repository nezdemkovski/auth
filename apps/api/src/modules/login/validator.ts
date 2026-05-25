import { isRecord } from "../../runtime/type-guards";

export type LoginSessionCodeInput = {
  redirectUri: string;
  state: string;
  codeChallenge: string;
};

export type LoginCodeExchangeInput = {
  code: string;
  redirectUri: string;
  codeVerifier: string;
};

export const parseLoginSessionCodeInput = (body: unknown) => {
  const redirectUri = getStringField(body, "redirect_uri");
  const codeChallenge = getStringField(body, "code_challenge");
  if (!redirectUri || !codeChallenge) {
    return null;
  }

  return {
    redirectUri,
    state: getStringField(body, "state"),
    codeChallenge
  };
};

export const parseLoginCodeExchangeInput = (body: unknown) => {
  const code = getStringField(body, "code");
  const redirectUri = getStringField(body, "redirect_uri");
  const codeVerifier = getStringField(body, "code_verifier");
  if (!code || !redirectUri || !codeVerifier) {
    return null;
  }

  return {
    code,
    redirectUri,
    codeVerifier
  };
};

const getStringField = (body: unknown, field: string) => {
  if (!isRecord(body)) {
    return "";
  }

  const value = body[field];
  return typeof value === "string" ? value : "";
};
