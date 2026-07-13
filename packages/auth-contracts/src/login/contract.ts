import { stringField } from "../shared/validator";

export enum LoginMode {
  Login = "login",
  Signup = "signup"
}

export enum PkceChallengeMethod {
  S256 = "S256"
}

export type LoginCodeExchangeRequest = {
  code: string;
  redirect_uri: string;
  code_verifier: string;
};

export type LoginCodeExchangeResponse = {
  sessionCookie: string;
  email: string | null;
};

export type AccessTokenResponse = {
  token: string;
};

export const parseLoginCodeExchangeResponse = (value: unknown): LoginCodeExchangeResponse | null => {
  const sessionCookie = stringField(value, "sessionCookie");
  if (!sessionCookie) {
    return null;
  }
  return {
    sessionCookie,
    email: stringField(value, "email")
  };
};

export const parseAccessTokenResponse = (value: unknown): AccessTokenResponse | null => {
  const token = stringField(value, "token");
  return token ? { token } : null;
};
