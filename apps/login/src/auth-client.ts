import { createAuthClient } from "better-auth/client";
import { lastLoginMethodClient, twoFactorClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

export type LoginAuthClient = ReturnType<typeof createLoginAuthClient>;

export function createLoginAuthClient(project: string) {
  return createAuthClient({
    baseURL: `${window.location.origin}/api/${project}/auth`,
    plugins: [passkeyClient(), twoFactorClient(), lastLoginMethodClient()]
  });
}

export type LoginSession = {
  user?: {
    id?: string;
    email?: string;
    role?: string | null;
    twoFactorEnabled?: boolean;
  };
} | null;

export async function signInWithEmail(options: {
  project: string;
  email: string;
  password: string;
}): Promise<{ ok: true; twoFactorRedirect: boolean } | { ok: false }> {
  const response = await fetch(`/api/${options.project}/auth/sign-in/email`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: options.email,
      password: options.password
    })
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    return { ok: false };
  }

  return {
    ok: true,
    twoFactorRedirect: payload?.twoFactorRedirect === true
  };
}

export async function signUpWithEmail(options: {
  project: string;
  email: string;
  password: string;
  callbackURL: string;
}): Promise<boolean> {
  const response = await fetch(`/api/${options.project}/auth/sign-up/email`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: options.email,
      password: options.password,
      name: options.email.split("@")[0],
      callbackURL: options.callbackURL
    })
  });

  return response.ok;
}

export async function signInWithSocial(options: {
  project: string;
  provider: string;
  callbackURL: string;
}): Promise<boolean> {
  const response = await fetch(`/api/${options.project}/auth/sign-in/social`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      provider: options.provider,
      callbackURL: options.callbackURL
    })
  });
  const payload = (await response.json().catch(() => null)) as {
    url?: string;
    redirect?: boolean;
  } | null;

  if (!response.ok || !payload?.url) {
    return false;
  }

  window.location.assign(payload.url);
  return true;
}

export async function verifyTwoFactorCode(options: {
  project: string;
  code: string;
}): Promise<boolean> {
  const totp = await postTwoFactor(options.project, "/two-factor/verify-totp", {
    code: options.code,
    trustDevice: true
  });

  if (totp) {
    return true;
  }

  return postTwoFactor(options.project, "/two-factor/verify-backup-code", {
    code: options.code
  });
}

export async function getLoginSession(project: string): Promise<LoginSession> {
  const response = await fetch(`/api/${project}/auth/get-session`, {
    credentials: "include"
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json().catch(() => null)) as LoginSession;
}

export async function requestLoginPasswordReset(options: {
  project: string;
  email: string;
  redirectTo: string;
}): Promise<boolean> {
  const response = await fetch(`/api/${options.project}/auth/request-password-reset`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: options.email,
      redirectTo: options.redirectTo
    })
  });

  return response.ok;
}

export async function resetLoginPassword(options: {
  project: string;
  token: string;
  newPassword: string;
}): Promise<boolean> {
  const response = await fetch(`/api/${options.project}/auth/reset-password`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      token: options.token,
      newPassword: options.newPassword
    })
  });

  return response.ok;
}

export async function hasPasskeys(project: string): Promise<boolean> {
  const response = await fetch(`/api/${project}/auth/passkey/list-user-passkeys`, {
    credentials: "include"
  });
  const payload = await response.json().catch(() => null);

  return response.ok && Array.isArray(payload) && payload.length > 0;
}

export async function createLoginSessionRedirect(options: {
  project: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): Promise<string | null> {
  const response = await fetch(`/api/${options.project}/login/session-code`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      redirect_uri: options.redirectUri,
      state: options.state,
      code_challenge: options.codeChallenge
    })
  });
  const payload = (await response.json().catch(() => null)) as {
    redirectTo?: string;
  } | null;

  return response.ok && payload?.redirectTo ? payload.redirectTo : null;
}

export type OAuthPublicClient = {
  client_id: string;
  client_name?: string | null;
  client_uri?: string | null;
  logo_uri?: string | null;
};

export async function getOAuthPublicClient(options: {
  project: string;
  clientId: string;
}): Promise<OAuthPublicClient | null> {
  const url = new URL(
    `/api/${options.project}/auth/oauth2/public-client`,
    window.location.origin
  );
  url.searchParams.set("client_id", options.clientId);

  const response = await fetch(url, {
    credentials: "include"
  });
  const payload = (await response.json().catch(() => null)) as
    | OAuthPublicClient
    | null;

  return response.ok && payload ? payload : null;
}

export async function submitOAuthConsent(options: {
  project: string;
  accept: boolean;
  scopes: string[];
  oauthQuery: string;
}): Promise<string | null> {
  const response = await fetch(`/api/${options.project}/auth/oauth2/consent`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      accept: options.accept,
      scope: options.scopes.join(" "),
      oauth_query: options.oauthQuery
    })
  });
  const payload = (await response.json().catch(() => null)) as {
    url?: string;
    redirect_uri?: string;
  } | null;

  if (!response.ok) {
    return null;
  }

  return payload?.url ?? payload?.redirect_uri ?? null;
}

async function postTwoFactor(
  project: string,
  path: string,
  body: Record<string, unknown>
): Promise<boolean> {
  const response = await fetch(`/api/${project}/auth${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  return response.ok;
}
