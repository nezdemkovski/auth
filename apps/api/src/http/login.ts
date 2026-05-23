import { createHash } from "node:crypto";

import type { AuthRegistry } from "../auth/registry";
import { ReconnectingRedisClient, type RedisBackedStore } from "./security";

const CODE_TTL_SECONDS = 60;

type PendingLoginCode = {
  project: string;
  sessionCookie: string;
  email: string;
  redirectUri: string;
  codeChallenge: string;
  expiresAt: number;
};

type LoginOptions = {
  registry: AuthRegistry;
  secret: string;
  codeStore: LoginCodeStore;
  trustProxyHeaders?: boolean;
};

type LoginConfigOptions = {
  registry: AuthRegistry;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

type LoginCodeStore = RedisBackedStore & {
  set(code: string, payload: PendingLoginCode): Promise<void>;
  get(code: string): Promise<PendingLoginCode | null>;
  delete(code: string): Promise<void>;
};

const pendingLoginCodes = new Map<string, PendingLoginCode>();

export function createLoginCodeStore(redisUrl: string | null): LoginCodeStore {
  if (redisUrl) {
    return new RedisLoginCodeStore(redisUrl);
  }

  return new MemoryLoginCodeStore();
}

class MemoryLoginCodeStore implements LoginCodeStore {
  async connect(): Promise<void> {}

  async set(code: string, payload: PendingLoginCode): Promise<void> {
    pruneExpiredCodes();
    pendingLoginCodes.set(code, payload);
  }

  async get(code: string): Promise<PendingLoginCode | null> {
    pruneExpiredCodes();
    const pending = pendingLoginCodes.get(code);
    if (!pending || pending.expiresAt < Date.now()) {
      pendingLoginCodes.delete(code);
      return null;
    }

    return pending;
  }

  async delete(code: string): Promise<void> {
    pendingLoginCodes.delete(code);
  }

  async close(): Promise<void> {}
}

class RedisLoginCodeStore implements LoginCodeStore {
  private readonly client: ReconnectingRedisClient;

  constructor(redisUrl: string) {
    this.client = new ReconnectingRedisClient(redisUrl);
  }

  connect(): Promise<void> {
    return this.client.connect();
  }

  async set(code: string, payload: PendingLoginCode): Promise<void> {
    await this.client.withClient((redis) =>
      redis.set(loginCodeKey(code), JSON.stringify(payload), "EX", CODE_TTL_SECONDS)
    );
  }

  async get(code: string): Promise<PendingLoginCode | null> {
    const value = await this.client.withClient((redis) => redis.get(loginCodeKey(code)));
    if (!value) {
      return null;
    }

    const parsed = JSON.parse(value) as PendingLoginCode;
    if (parsed.expiresAt < Date.now()) {
      await this.delete(code);
      return null;
    }

    return parsed;
  }

  async delete(code: string): Promise<void> {
    await this.client.withClient((redis) => redis.del(loginCodeKey(code)));
  }

  close(): void {
    this.client.close();
  }
}

function loginCodeKey(code: string): string {
  return `auth:login-code:${code}`;
}

function pruneExpiredCodes(now = Date.now()): void {
  for (const [code, payload] of pendingLoginCodes) {
    if (payload.expiresAt < now) {
      pendingLoginCodes.delete(code);
    }
  }
}

function createCode(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
    "base64url"
  );
}

function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function validPkceChallenge(value: string): boolean {
  return /^[A-Za-z0-9_-]{43,128}$/.test(value);
}

function verifyPkce(codeChallenge: string, codeVerifier: string): boolean {
  return validPkceChallenge(codeVerifier) && pkceChallenge(codeVerifier) === codeChallenge;
}

function redirectUriAllowed(
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

function runtimeConfig(data: unknown, status = 200): Response {
  return json(data, status);
}

export function getLoginConfig(
  req: Request,
  project: string,
  options: LoginConfigOptions
): Response {
  const registered = options.registry.get(project);
  if (!registered) {
    return json({ error: "unknown_project" }, 404);
  }

  const url = new URL(req.url);
  const redirectUri = url.searchParams.get("redirect_uri") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const mode = url.searchParams.get("mode") === "signup" ? "signup" : "login";
  const codeChallenge = url.searchParams.get("code_challenge") ?? "";
  const codeChallengeMethod = url.searchParams.get("code_challenge_method") ?? "";

  if (!redirectUriAllowed(options.registry, project, redirectUri)) {
    return json({ error: "invalid_redirect_uri" }, 400);
  }

  if (codeChallengeMethod !== "S256" || !validPkceChallenge(codeChallenge)) {
    return json({ error: "invalid_pkce_challenge" }, 400);
  }

  return runtimeConfig({
    page: "login",
    project,
    projectName: registered.project.name,
    redirectUri,
    state,
    mode,
    codeChallenge,
    features: registered.project.features,
    socialProviders: enabledSocialProviders(registered)
  });
}

export function getPasswordResetConfig(
  req: Request,
  project: string,
  options: LoginConfigOptions
): Response {
  const registered = options.registry.get(project);
  if (!registered) {
    return json({ error: "unknown_project" }, 404);
  }

  const url = new URL(req.url);

  return runtimeConfig({
    page: "reset-password",
    project,
    projectName: registered.project.name,
    appUrl: registered.project.appUrl,
    token: url.searchParams.get("token") ?? "",
    error: url.searchParams.get("error") ?? ""
  });
}

export function getOAuthConsentConfig(
  req: Request,
  project: string,
  options: LoginConfigOptions
): Response {
  const registered = options.registry.get(project);
  if (!registered) {
    return json({ error: "unknown_project" }, 404);
  }

  if (!registered.project.features.oauthProvider.enabled) {
    return json({ error: "not_found" }, 404);
  }

  const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id") ?? "";
  const scopes = (url.searchParams.get("scope") ?? "")
    .split(" ")
    .map((scope) => scope.trim())
    .filter(Boolean);

  if (!clientId) {
    return json({ error: "missing_client_id" }, 400);
  }

  return runtimeConfig({
    page: "oauth-consent",
    project,
    projectName: registered.project.name,
    clientId,
    scopes,
    oauthQuery: url.searchParams.toString()
  });
}

function enabledSocialProviders(
  registered: NonNullable<ReturnType<AuthRegistry["get"]>>
): string[] {
  return Object.entries(registered.project.socialProviders)
    .filter(([, provider]) => provider.enabled && provider.clientId && provider.clientSecret)
    .map(([provider]) => provider);
}

async function issueLoginCodeFromSession(options: {
  registered: NonNullable<ReturnType<AuthRegistry["get"]>>;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  headers: Headers;
  trustProxyHeaders: boolean;
  codeStore: LoginCodeStore;
}): Promise<{ redirectTo: string; email: string } | null> {
  const authPath = `/${options.registered.project.slug}/api/auth`;
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
    expiresAt: Date.now() + CODE_TTL_SECONDS * 1000
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

function internalAuthHeaders(
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

export const __loginTestUtils = {
  createLoginCodeStore,
  internalAuthHeaders,
  pkceChallenge,
  redirectUriAllowed,
  validPkceChallenge,
  verifyPkce
};

export async function createLoginSessionCode(
  req: Request,
  project: string,
  options: LoginOptions
): Promise<Response> {
  const registered = options.registry.get(project);
  if (!registered) {
    return json({ error: "unknown_project" }, 404);
  }

  const body = await req.json().catch(() => null);
  const redirectUri =
    typeof body?.redirect_uri === "string" ? body.redirect_uri : "";
  const state = typeof body?.state === "string" ? body.state : "";
  const codeChallenge =
    typeof body?.code_challenge === "string" ? body.code_challenge : "";

  if (!redirectUriAllowed(options.registry, project, redirectUri)) {
    return json({ error: "invalid_redirect_uri" }, 400);
  }

  if (!validPkceChallenge(codeChallenge)) {
    return json({ error: "invalid_pkce_challenge" }, 400);
  }

  const issued = await issueLoginCodeFromSession({
    registered,
    redirectUri,
    state,
    codeChallenge,
    headers: req.headers,
    trustProxyHeaders: options.trustProxyHeaders === true,
    codeStore: options.codeStore
  });

  if (!issued) {
    return json({ error: "unauthorized" }, 401);
  }

  return json(issued);
}

export async function exchangeLoginCode(
  req: Request,
  project: string,
  options: LoginOptions
): Promise<Response> {
  const registered = options.registry.get(project);
  if (!registered) {
    return json({ error: "unknown_project" }, 404);
  }

  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";
  const redirectUri =
    typeof body?.redirect_uri === "string" ? body.redirect_uri : "";
  const codeVerifier =
    typeof body?.code_verifier === "string" ? body.code_verifier : "";

  if (!redirectUriAllowed(options.registry, project, redirectUri)) {
    return json({ error: "invalid_redirect_uri" }, 400);
  }

  const payload = await options.codeStore.get(code);
  if (
    !payload ||
    payload.project !== project ||
    payload.redirectUri !== redirectUri ||
    !verifyPkce(payload.codeChallenge, codeVerifier)
  ) {
    return json({ error: "invalid_code" }, 400);
  }

  await options.codeStore.delete(code);

  return json({
    sessionCookie: payload.sessionCookie,
    email: payload.email
  });
}
