import { createAuthClient } from "better-auth/client";
import { lastLoginMethodClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

export type HostedAuthClient = ReturnType<typeof createHostedAuthClient>;

export function createHostedAuthClient(project: string) {
  return createAuthClient({
    baseURL: `${window.location.origin}/${project}/api/auth`,
    plugins: [passkeyClient(), lastLoginMethodClient()]
  });
}

export async function signInWithEmail(options: {
  project: string;
  email: string;
  password: string;
}): Promise<{ ok: true; twoFactorRedirect: boolean } | { ok: false }> {
  const response = await fetch(`/${options.project}/api/auth/sign-in/email`, {
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
  const response = await fetch(`/${options.project}/api/auth/sign-up/email`, {
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
  const response = await fetch(`/${options.project}/api/auth/sign-in/social`, {
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

export async function createHostedSessionRedirect(options: {
  project: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): Promise<string | null> {
  const response = await fetch(`/${options.project}/hosted/session-code`, {
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

async function postTwoFactor(
  project: string,
  path: string,
  body: Record<string, unknown>
): Promise<boolean> {
  const response = await fetch(`/${project}/api/auth${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  return response.ok;
}
