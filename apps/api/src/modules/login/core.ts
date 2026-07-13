import type { AuthProject } from "../../config/projects";
import { ErrorCode } from "../../runtime/error-codes";
import { isRecord } from "../../runtime/type-guards";

export type LoginRegisteredProject = {
  project: AuthProject;
  auth: {
    handler(request: Request): Promise<Response>;
  };
};

export type LoginProjectRegistry = {
  get(slug: string): LoginRegisteredProject | null;
};

export type LoginCoreOptions = {
  registry: LoginProjectRegistry;
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

export const resolveLoginNextAction = async (
  options: LoginCoreOptions,
  input: {
    project: string;
    headers: Headers;
  }
) => {
  const registered = options.registry.get(input.project);
  if (!registered) {
    throw new LoginFlowError(ErrorCode.UnknownProject, 404);
  }

  const authOptions = {
    registered,
    headers: input.headers,
    trustProxyHeaders: options.trustProxyHeaders === true
  };
  const user = await readLoginSession(authOptions);
  if (!user) {
    throw new LoginFlowError(ErrorCode.Unauthorized, 401);
  }

  return {
    registered,
    user,
    hasPasskeys: await readHasPasskeys(authOptions)
  };
};

export const internalAuthHeaders = (
  source: Headers,
  headers: HeadersInit,
  options: { trustProxyHeaders: boolean }
) => {
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

const readLoginSession = async (options: {
  registered: LoginRegisteredProject;
  headers: Headers;
  trustProxyHeaders: boolean;
}) => {
  const response = await options.registered.auth.handler(
    internalAuthRequest(options, "/get-session")
  );
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok || !isRecord(payload) || !isRecord(payload["user"])) {
    return null;
  }

  const user = payload["user"];
  return {
    role: typeof user["role"] === "string" ? user["role"] : null,
    twoFactorEnabled: user["twoFactorEnabled"] === true
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
  const payload: unknown = await response.json().catch(() => null);

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
