import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { AuthRegistry } from "../auth/registry";
import { ReconnectingRedisClient, type RedisBackedStore } from "./security";

const CODE_TTL_SECONDS = 60;
const HOSTED_LOGIN_INDEX = join(
  import.meta.dir,
  "..",
  "..",
  "dist",
  "hosted-login",
  "index.html"
);

type PendingHostedCode = {
  project: string;
  sessionCookie: string;
  email: string;
  redirectUri: string;
  codeChallenge: string;
  expiresAt: number;
};

type HostedOptions = {
  registry: AuthRegistry;
  secret: string;
  codeStore: HostedCodeStore;
  trustProxyHeaders?: boolean;
  cspNonce?: string;
};

function html(content: string, status = 200): Response {
  return new Response(content, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    }
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#039;";
    }
  });
}

function serializeHostedConfig(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

type HostedCodeStore = RedisBackedStore & {
  set(code: string, payload: PendingHostedCode): Promise<void>;
  get(code: string): Promise<PendingHostedCode | null>;
  delete(code: string): Promise<void>;
};

const pendingHostedCodes = new Map<string, PendingHostedCode>();

export function createHostedCodeStore(redisUrl: string | null): HostedCodeStore {
  if (redisUrl) {
    return new RedisHostedCodeStore(redisUrl);
  }

  return new MemoryHostedCodeStore();
}

class MemoryHostedCodeStore implements HostedCodeStore {
  async connect(): Promise<void> {}

  async set(code: string, payload: PendingHostedCode): Promise<void> {
    pruneExpiredCodes();
    pendingHostedCodes.set(code, payload);
  }

  async get(code: string): Promise<PendingHostedCode | null> {
    pruneExpiredCodes();
    const pending = pendingHostedCodes.get(code);
    if (!pending || pending.expiresAt < Date.now()) {
      pendingHostedCodes.delete(code);
      return null;
    }

    return pending;
  }

  async delete(code: string): Promise<void> {
    pendingHostedCodes.delete(code);
  }

  async close(): Promise<void> {}
}

class RedisHostedCodeStore implements HostedCodeStore {
  private readonly client: ReconnectingRedisClient;

  constructor(redisUrl: string) {
    this.client = new ReconnectingRedisClient(redisUrl);
  }

  connect(): Promise<void> {
    return this.client.connect();
  }

  async set(code: string, payload: PendingHostedCode): Promise<void> {
    await this.client.withClient((redis) =>
      redis.set(hostedCodeKey(code), JSON.stringify(payload), "EX", CODE_TTL_SECONDS)
    );
  }

  async get(code: string): Promise<PendingHostedCode | null> {
    const value = await this.client.withClient((redis) => redis.get(hostedCodeKey(code)));
    if (!value) {
      return null;
    }

    const parsed = JSON.parse(value) as PendingHostedCode;
    if (parsed.expiresAt < Date.now()) {
      await this.delete(code);
      return null;
    }

    return parsed;
  }

  async delete(code: string): Promise<void> {
    await this.client.withClient((redis) => redis.del(hostedCodeKey(code)));
  }

  close(): void {
    this.client.close();
  }
}

function hostedCodeKey(code: string): string {
  return `auth:hosted-code:${code}`;
}

function pruneExpiredCodes(now = Date.now()): void {
  for (const [code, payload] of pendingHostedCodes) {
    if (payload.expiresAt < now) {
      pendingHostedCodes.delete(code);
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

function renderLoginPage(options: {
  registered: NonNullable<ReturnType<AuthRegistry["get"]>>;
  projectName: string;
  project: string;
  redirectUri: string;
  state: string;
  mode: string;
  codeChallenge: string;
  cspNonce?: string;
  error?: string;
}): Response {
  const isSignup = options.mode === "signup";
  const title = isSignup ? "Create account" : "Log in";
  const index = readFileSync(HOSTED_LOGIN_INDEX, "utf8");
  const config = serializeHostedConfig({
    page: "login",
    project: options.project,
    projectName: options.projectName,
    redirectUri: options.redirectUri,
    state: options.state,
    mode: isSignup ? "signup" : "login",
    codeChallenge: options.codeChallenge,
    features: options.registered.project.features,
    socialProviders: Object.entries(options.registered.project.socialProviders)
      .filter(([, provider]) => provider.enabled && provider.clientId && provider.clientSecret)
      .map(([provider]) => provider),
    error: options.error
  });

  return html(
    index
      .replace("<title>Sign in</title>", `<title>${escapeHtml(title)} - ${escapeHtml(options.projectName)}</title>`)
      .replaceAll("__CSP_NONCE__", escapeHtml(options.cspNonce ?? ""))
      .replace(
        "<!-- hosted-auth-config -->",
        `<script nonce="${escapeHtml(options.cspNonce ?? "")}">window.__HOSTED_AUTH__=${config};</script>`
      )
  );
}

function renderOAuthConsentPage(options: {
  registered: NonNullable<ReturnType<AuthRegistry["get"]>>;
  project: string;
  projectName: string;
  clientId: string;
  scopes: string[];
  oauthQuery: string;
  cspNonce?: string;
}): Response {
  const index = readFileSync(HOSTED_LOGIN_INDEX, "utf8");
  const config = serializeHostedConfig({
    page: "oauth-consent",
    project: options.project,
    projectName: options.projectName,
    clientId: options.clientId,
    scopes: options.scopes,
    oauthQuery: options.oauthQuery
  });

  return html(
    index
      .replace(
        "<title>Sign in</title>",
        `<title>Authorize - ${escapeHtml(options.projectName)}</title>`
      )
      .replaceAll("__CSP_NONCE__", escapeHtml(options.cspNonce ?? ""))
      .replace(
        "<!-- hosted-auth-config -->",
        `<script nonce="${escapeHtml(options.cspNonce ?? "")}">window.__HOSTED_AUTH__=${config};</script>`
      )
  );
}

async function issueSession(options: {
  registered: NonNullable<ReturnType<AuthRegistry["get"]>>;
  mode: string;
  email: string;
  password: string;
  redirectUri: string;
  headers: Headers;
  trustProxyHeaders: boolean;
}): Promise<{ sessionCookie: string; email: string } | null> {
  const callbackURL = callbackUrlFromRedirectUri(options.redirectUri);
  const body =
    options.mode === "signup"
      ? {
          email: options.email,
          password: options.password,
          name: options.email.split("@")[0],
          callbackURL
        }
      : {
          email: options.email,
          password: options.password
        };
  const endpoint =
    options.mode === "signup" ? "/sign-up/email" : "/sign-in/email";
  const authPath = `/${options.registered.project.slug}/api/auth`;

  const authRes = await options.registered.auth.handler(
    new Request(`http://auth.local${authPath}${endpoint}`, {
      method: "POST",
      headers: internalAuthHeaders(options.headers, {
        "Content-Type": "application/json"
      }, options),
      body: JSON.stringify(body)
    })
  );

  if (!authRes.ok) {
    return null;
  }

  const cookies = authRes.headers.getSetCookie();
  const cookie = cookies.map((value) => value.split(";")[0]).join("; ");
  const sessionRes = await options.registered.auth.handler(
    new Request(`http://auth.local${authPath}/get-session`, {
      headers: internalAuthHeaders(options.headers, {
        Cookie: cookie
      }, options)
    })
  );

  if (!sessionRes.ok) {
    return null;
  }

  const session = await sessionRes.json().catch(() => null);
  const email =
    typeof session?.user?.email === "string" ? session.user.email : options.email;

  return {
    sessionCookie: cookie,
    email
  };
}

async function issueHostedCodeFromSession(options: {
  registered: NonNullable<ReturnType<AuthRegistry["get"]>>;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  headers: Headers;
  trustProxyHeaders: boolean;
  codeStore: HostedCodeStore;
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

export function renderHostedLogin(
  req: Request,
  project: string,
  options: HostedOptions
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
    return html("Invalid redirect_uri", 400);
  }

  if (codeChallengeMethod !== "S256" || !validPkceChallenge(codeChallenge)) {
    return html("Invalid PKCE challenge", 400);
  }

  return renderLoginPage({
    registered,
    project,
    projectName: registered.project.name,
    redirectUri,
    state,
    mode,
    codeChallenge,
    cspNonce: options.cspNonce
  });
}

export function renderHostedOAuthConsent(
  req: Request,
  project: string,
  options: HostedOptions
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
    return html("Missing client_id", 400);
  }

  return renderOAuthConsentPage({
    registered,
    project,
    projectName: registered.project.name,
    clientId,
    scopes,
    oauthQuery: url.searchParams.toString(),
    cspNonce: options.cspNonce
  });
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

function callbackUrlFromRedirectUri(redirectUri: string): string {
  return new URL(redirectUri).origin;
}

export const __hostedTestUtils = {
  callbackUrlFromRedirectUri,
  createHostedCodeStore,
  escapeHtml,
  internalAuthHeaders,
  pkceChallenge,
  redirectUriAllowed,
  serializeHostedConfig,
  validPkceChallenge,
  verifyPkce
};

export async function submitHostedLogin(
  req: Request,
  project: string,
  options: HostedOptions
): Promise<Response> {
  const registered = options.registry.get(project);
  if (!registered) {
    return json({ error: "unknown_project" }, 404);
  }

  const form = await req.formData();
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const state = String(form.get("state") ?? "");
  const mode = form.get("mode") === "signup" ? "signup" : "login";
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const codeChallenge = String(form.get("code_challenge") ?? "");

  if (!redirectUriAllowed(options.registry, project, redirectUri)) {
    return html("Invalid redirect_uri", 400);
  }

  if (!validPkceChallenge(codeChallenge)) {
    return html("Invalid PKCE challenge", 400);
  }

  const session = await issueSession({
    registered,
    mode,
    email,
    password,
    redirectUri,
    headers: req.headers,
    trustProxyHeaders: options.trustProxyHeaders === true
  });

  if (!session) {
    return renderLoginPage({
      registered,
      project,
      projectName: registered.project.name,
      redirectUri,
      state,
      mode,
      codeChallenge,
      cspNonce: options.cspNonce,
      error: mode === "signup" ? "Could not create account" : "Invalid email or password"
    });
  }

  const code = createCode();
  await options.codeStore.set(code, {
    project,
    sessionCookie: session.sessionCookie,
    email: session.email,
    redirectUri,
    codeChallenge,
    expiresAt: Date.now() + CODE_TTL_SECONDS * 1000
  });

  const callback = new URL(redirectUri);
  callback.searchParams.set("code", code);
  if (state) {
    callback.searchParams.set("state", state);
  }

  return Response.redirect(callback.toString(), 302);
}

export async function createHostedSessionCode(
  req: Request,
  project: string,
  options: HostedOptions
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

  const issued = await issueHostedCodeFromSession({
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

export async function exchangeHostedCode(
  req: Request,
  project: string,
  options: HostedOptions
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
