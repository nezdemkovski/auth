import type { AuthRegistry, RegisteredProject } from "../../auth/registry";
import {
  randomBase64Url,
  sha256Base64Url
} from "../../runtime/crypto";
import {
  LOGIN_CODE_TTL_SECONDS,
  type LoginCodeStore
} from "./store";

export type LoginFlowOptions = {
  registry: AuthRegistry;
  codeStore: LoginCodeStore;
  trustProxyHeaders?: boolean;
};

export class LoginFlowError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400
  ) {
    super(code);
    this.name = "LoginFlowError";
  }
}

export class LoginFlowService {
  constructor(private readonly options: LoginFlowOptions) {}

  async createSessionCode(input: {
    project: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
    headers: Headers;
  }): Promise<{ redirectTo: string; email: string }> {
    const registered = this.options.registry.get(input.project);
    if (!registered) {
      throw new LoginFlowError("unknown_project", 404);
    }
    if (!redirectUriAllowed(this.options.registry, input.project, input.redirectUri)) {
      throw new LoginFlowError("invalid_redirect_uri");
    }
    if (!validPkceChallenge(input.codeChallenge)) {
      throw new LoginFlowError("invalid_pkce_challenge");
    }

    const issued = await issueLoginCodeFromSession({
      registered,
      redirectUri: input.redirectUri,
      state: input.state,
      codeChallenge: input.codeChallenge,
      headers: input.headers,
      trustProxyHeaders: this.options.trustProxyHeaders === true,
      codeStore: this.options.codeStore
    });

    if (!issued) {
      throw new LoginFlowError("unauthorized", 401);
    }

    return issued;
  }

  async exchangeCode(input: {
    project: string;
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<{ sessionCookie: string; email: string }> {
    const registered = this.options.registry.get(input.project);
    if (!registered) {
      throw new LoginFlowError("unknown_project", 404);
    }
    if (!redirectUriAllowed(this.options.registry, input.project, input.redirectUri)) {
      throw new LoginFlowError("invalid_redirect_uri");
    }

    const payload = await this.options.codeStore.get(input.code);
    if (
      !payload ||
      payload.project !== input.project ||
      payload.redirectUri !== input.redirectUri ||
      !verifyPkce(payload.codeChallenge, input.codeVerifier)
    ) {
      throw new LoginFlowError("invalid_code");
    }

    await this.options.codeStore.delete(input.code);

    return {
      sessionCookie: payload.sessionCookie,
      email: payload.email
    };
  }
}

function createCode(): string {
  return randomBase64Url(32);
}

export function pkceChallenge(verifier: string): string {
  return sha256Base64Url(verifier);
}

export function validPkceChallenge(value: string): boolean {
  return /^[A-Za-z0-9_-]{43,128}$/.test(value);
}

export function verifyPkce(codeChallenge: string, codeVerifier: string): boolean {
  return validPkceChallenge(codeVerifier) && pkceChallenge(codeVerifier) === codeChallenge;
}

export function redirectUriAllowed(
  registry: AuthRegistry,
  project: string,
  redirectUri: string
): boolean {
  try {
    const url = new URL(redirectUri);
    return registry.isTrustedOrigin(project, url.origin);
  } catch {
    return false;
  }
}

export function internalAuthHeaders(
  source: Headers,
  headers: HeadersInit,
  options: { trustProxyHeaders: boolean }
): Headers {
  const result = new Headers(headers);

  const headerNames = options.trustProxyHeaders
    ? [
        "cf-connecting-ip",
        "x-forwarded-for",
        "x-real-ip",
        "x-client-ip",
        "user-agent"
      ]
    : ["user-agent"];

  for (const name of headerNames) {
    const value = source.get(name);
    if (value) {
      result.set(name, value);
    }
  }

  return result;
}

async function issueLoginCodeFromSession(options: {
  registered: RegisteredProject;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  headers: Headers;
  trustProxyHeaders: boolean;
  codeStore: LoginCodeStore;
}): Promise<{ redirectTo: string; email: string } | null> {
  const authPath = `/api/${options.registered.project.slug}/auth`;
  const sessionRes = await options.registered.auth.handler(
    new Request(`http://auth.local${authPath}/get-session`, {
      headers: internalAuthHeaders(options.headers, {
        Cookie: options.headers.get("cookie") ?? ""
      }, options)
    })
  );

  if (!sessionRes.ok) {
    return null;
  }

  const session = await sessionRes.json().catch(() => null);
  const email = typeof session?.user?.email === "string" ? session.user.email : "";

  if (!email) {
    return null;
  }

  const code = createCode();
  await options.codeStore.set(code, {
    project: options.registered.project.slug,
    sessionCookie: options.headers.get("cookie") ?? "",
    email,
    redirectUri: options.redirectUri,
    codeChallenge: options.codeChallenge,
    expiresAt: Date.now() + LOGIN_CODE_TTL_SECONDS * 1000
  });

  const callback = new URL(options.redirectUri);
  callback.searchParams.set("code", code);
  if (options.state) {
    callback.searchParams.set("state", options.state);
  }

  return {
    redirectTo: callback.toString(),
    email
  };
}
