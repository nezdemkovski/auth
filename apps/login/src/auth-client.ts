import { createAuthClient } from "better-auth/client";
import { lastLoginMethodClient, twoFactorClient } from "better-auth/client/plugins";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { passkeyClient } from "@better-auth/passkey/client";

export type LoginAuthClient = ReturnType<typeof createLoginAuthClient>;

export const createLoginAuthClient = (project: string) => {
  return createAuthClient({
    baseURL: `${window.location.origin}/api/${project}/auth`,
    plugins: [
      oauthProviderClient(),
      passkeyClient(),
      twoFactorClient(),
      lastLoginMethodClient()
    ]
  });
};

export enum LoginNextAction {
  Redirect = "redirect",
  EnrollTwoFactor = "enroll_2fa",
  OfferPasskey = "offer_passkey"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const hasTwoFactorRedirect = (value: unknown) => {
  return isRecord(value) && value["twoFactorRedirect"] === true;
};

export const signInWithEmail = async (options: {
  authClient: LoginAuthClient;
  email: string;
  password: string;
}): Promise<{ ok: true; twoFactorRedirect: boolean } | { ok: false }> => {
  const result = await options.authClient.signIn.email({
    email: options.email,
    password: options.password
  });

  if (result.error) {
    return { ok: false };
  }

  return {
    ok: true,
    twoFactorRedirect: hasTwoFactorRedirect(result.data)
  };
};

export const signUpWithEmail = async (options: {
  authClient: LoginAuthClient;
  email: string;
  password: string;
}): Promise<boolean> => {
  const result = await options.authClient.signUp.email({
    email: options.email,
    password: options.password,
    name: options.email.split("@")[0]
  });

  return !result.error;
};

export const signInWithSocial = async (options: {
  authClient: LoginAuthClient;
  provider: string;
}): Promise<boolean> => {
  const result = await options.authClient.signIn.social({
    provider: options.provider
  });

  return !result.error;
};

export const verifyTwoFactorCode = async (options: {
  authClient: LoginAuthClient;
  code: string;
}): Promise<boolean> => {
  const totp = await options.authClient.twoFactor.verifyTotp({
    code: options.code,
    trustDevice: true
  });

  if (!totp.error) {
    return true;
  }

  const backup = await options.authClient.twoFactor.verifyBackupCode({
    code: options.code
  });

  return !backup.error;
};

export const requestLoginPasswordReset = async (options: {
  authClient: LoginAuthClient;
  email: string;
  redirectTo: string;
}): Promise<boolean> => {
  const result = await options.authClient.requestPasswordReset({
    email: options.email,
    redirectTo: options.redirectTo
  });

  return !result.error;
};

export const resetLoginPassword = async (options: {
  authClient: LoginAuthClient;
  token: string;
  newPassword: string;
}): Promise<boolean> => {
  const result = await options.authClient.resetPassword({
    token: options.token,
    newPassword: options.newPassword
  });

  return !result.error;
};

export const getLoginNextAction = async (
  project: string
): Promise<LoginNextAction | null> => {
  const response = await fetch(`/api/${project}/login/next-action`, {
    credentials: "include"
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok || !isRecord(payload)) {
    return null;
  }

  const action = payload["action"];
  if (
    action === LoginNextAction.Redirect ||
    action === LoginNextAction.EnrollTwoFactor ||
    action === LoginNextAction.OfferPasskey
  ) {
    return action;
  }

  return null;
};

export type OAuthPublicClient = {
  client_id: string;
  client_name?: string | null;
  client_uri?: string | null;
  logo_uri?: string | null;
};

export const getOAuthPublicClient = async (options: {
  authClient: LoginAuthClient;
  clientId: string;
}): Promise<OAuthPublicClient | null> => {
  const result = await options.authClient.oauth2.publicClient({
    query: {
      client_id: options.clientId
    }
  });

  return result.error ? null : result.data ?? null;
};

export const submitOAuthConsent = async (options: {
  authClient: LoginAuthClient;
  accept: boolean;
  scopes: string[];
}): Promise<string | null> => {
  const result = await options.authClient.oauth2.consent({
    accept: options.accept,
    scope: options.scopes.join(" ")
  });

  if (result.error || !result.data) {
    return null;
  }

  return result.data.url ?? null;
};

export const continueOAuthPostLogin = async (options: {
  authClient: LoginAuthClient;
}) => {
  const result = await options.authClient.oauth2.continue({
    postLogin: true
  });

  if (result.error || !result.data) {
    return null;
  }

  return result.data.url ?? null;
};
