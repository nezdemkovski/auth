import type { AuthRegistry } from "../../auth/registry";
import type { AuthProject } from "../../config/projects";
import {
  randomBase64Url,
  sha256Base64Url
} from "../../runtime/crypto";
import {
  LOGIN_CODE_TTL_SECONDS,
  type LoginCodeStore
} from "./store";
import { ErrorCode } from "../../runtime/error-codes";

export type LoginFlowOptions = {
  registry: LoginProjectRegistry;
  codeStore: LoginCodeStore;
  trustProxyHeaders?: boolean;
};

export type LoginRegisteredProject = {
  project: AuthProject;
  auth: {
    handler(request: Request): Promise<Response>;
  };
};

export type LoginProjectRegistry = {
  get(slug: string): LoginRegisteredProject | null;
} & Pick<AuthRegistry, "isTrustedOrigin">;
type TrustedOriginRegistry = Pick<LoginProjectRegistry, "isTrustedOrigin">;

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

  async nextAction(input: {
    project: string;
    headers: Headers;
  }) {
    const registered = this.options.registry.get(input.project);
    if (!registered) {
      throw new LoginFlowError(ErrorCode.UnknownProject, 404);
    }

    const session = await readLoginSession({
      registered,
      headers: input.headers,
      trustProxyHeaders: this.options.trustProxyHeaders === true
    });
    if (!session) {
      throw new LoginFlowError(ErrorCode.Unauthorized, 401);
    }

    return {
      registered,
      user: session.user,
      hasPasskeys: await readHasPasskeys({
        registered,
        headers: input.headers,
        trustProxyHeaders: this.options.trustProxyHeaders === true
      })
    };
  }

  async createSessionCode(input: {
    project: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
    headers: Headers;
  }) {
    const registered = this.options.registry.get(input.project);
    if (!registered) {
      throw new LoginFlowError(ErrorCode.UnknownProject, 404);
    }
    if (!redirectUriAllowed(this.options.registry, input.project, input.redirectUri)) {
      throw new LoginFlowError(ErrorCode.InvalidRedirectUri);
    }
    if (!validPkceChallenge(input.codeChallenge)) {
      throw new LoginFlowError(ErrorCode.InvalidPkceChallenge);
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
      throw new LoginFlowError(ErrorCode.Unauthorized, 401);
    }

    return issued;
  }

  async exchangeCode(input: {
    project: string;
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }) {
    const registered = this.options.registry.get(input.project);
    if (!registered) {
      throw new LoginFlowError(ErrorCode.UnknownProject, 404);
    }
    if (!redirectUriAllowed(this.options.registry, input.project, input.redirectUri)) {
      throw new LoginFlowError(ErrorCode.InvalidRedirectUri);
    }

    const codeChallenge = pkceChallenge(input.codeVerifier);
    const payload = await this.options.codeStore.consume(input.code, {
      project: input.project,
      redirectUri: input.redirectUri,
      codeChallenge
    });
    if (!payload) {
      throw new LoginFlowError(ErrorCode.InvalidCode);
    }

    return {
      sessionCookie: payload.sessionCookie,
      email: payload.email
    };
  }
}

const createCode = () => {
  return randomBase64Url(32);
};

export const pkceChallenge = (verifier: string) => {
  return sha256Base64Url(verifier);
};

export const validPkceChallenge = (value: string) => {
  return /^[A-Za-z0-9_-]{43,128}$/.test(value);
};

export const verifyPkce = (codeChallenge: string, codeVerifier: string) => {
  return validPkceChallenge(codeVerifier) && pkceChallenge(codeVerifier) === codeChallenge;
};

export const redirectUriAllowed = (registry: TrustedOriginRegistry, project: string, redirectUri: string) => {
  try {
    const url = new URL(redirectUri);
    return registry.isTrustedOrigin(project, url.origin);
  } catch {
    return false;
  }
};

export const internalAuthHeaders = (source: Headers, headers: HeadersInit, options: { trustProxyHeaders: boolean }) => {
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
};

const issueLoginCodeFromSession = async (options: {
  registered: LoginRegisteredProject;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  headers: Headers;
  trustProxyHeaders: boolean;
  codeStore: LoginCodeStore;
}) => {
  const session = await readLoginSession(options);
  const email = typeof session?.user.email === "string" ? session.user.email : "";

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
};

const readLoginSession = async (options: {
  registered: LoginRegisteredProject;
  headers: Headers;
  trustProxyHeaders: boolean;
}) => {
  const response = await options.registered.auth.handler(
    internalAuthRequest(options, "/get-session")
  );

  if (!response.ok) {
    return null;
  }

  const session = await response.json().catch(() => null);
  if (!session?.user || typeof session.user !== "object") {
    return null;
  }

  return {
    user: {
      email: typeof session.user.email === "string" ? session.user.email : "",
      role: typeof session.user.role === "string" ? session.user.role : null,
      twoFactorEnabled: session.user.twoFactorEnabled === true
    }
  };
};

const readHasPasskeys = async (options: {
  registered: LoginRegisteredProject;
  headers: Headers;
  trustProxyHeaders: boolean;
}) => {
  const response = await options.registered.auth.handler(
    internalAuthRequest(options, "/passkey/list-user-passkeys")
  );
  const payload = await response.json().catch(() => null);

  return response.ok && Array.isArray(payload) && payload.length > 0;
};

const internalAuthRequest = (
  options: {
    registered: LoginRegisteredProject;
    headers: Headers;
    trustProxyHeaders: boolean;
  },
  path: string
) => {
  const authPath = `/api/${options.registered.project.slug}/auth${path}`;
  return new Request(`http://auth.local${authPath}`, {
    headers: internalAuthHeaders(
      options.headers,
      {
        Cookie: options.headers.get("cookie") ?? ""
      },
      options
    )
  });
};
