import type { AuthRegistry } from "../../auth/registry";
import type { Hono } from "hono";
import {
  LoginFlowError,
  LoginFlowService,
  redirectUriAllowed,
  validPkceChallenge
} from "./core";
import {
  createLoginCodeStore,
  type LoginCodeStore
} from "./store";
import {
  parseLoginCodeExchangeInput,
  parseLoginSessionCodeInput
} from "./validator";

export { createLoginCodeStore };

type LoginVariables = {
  registry: AuthRegistry;
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

export function registerLoginRoutes(
  app: Hono<{ Variables: LoginVariables }>,
  options: LoginOptions
): void {
  app.get("/api/:project/login/config/login", (c) =>
    getLoginConfig(c.req.raw, c.req.param("project"), options)
  );
  app.get("/api/:project/login/config/reset-password", (c) =>
    getPasswordResetConfig(c.req.raw, c.req.param("project"), options)
  );
  app.get("/api/:project/login/config/oauth-consent", (c) =>
    getOAuthConsentConfig(c.req.raw, c.req.param("project"), options)
  );

  app.post("/api/:project/login/token", (c) => {
    return exchangeLoginCode(c.req.raw, c.req.param("project"), options);
  });

  app.post("/api/:project/login/session-code", (c) => {
    return createLoginSessionCode(c.req.raw, c.req.param("project"), options);
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

export async function createLoginSessionCode(
  req: Request,
  project: string,
  options: LoginOptions
): Promise<Response> {
  const input = parseLoginSessionCodeInput(await req.json().catch(() => null));
  const service = new LoginFlowService(options);

  try {
    return json(
      await service.createSessionCode({
        project,
        redirectUri: input.redirectUri,
        state: input.state,
        codeChallenge: input.codeChallenge,
        headers: req.headers
      })
    );
  } catch (error) {
    return loginFlowError(error);
  }
}

export async function exchangeLoginCode(
  req: Request,
  project: string,
  options: LoginOptions
): Promise<Response> {
  const input = parseLoginCodeExchangeInput(await req.json().catch(() => null));
  const service = new LoginFlowService(options);

  try {
    return json(
      await service.exchangeCode({
        project,
        code: input.code,
        redirectUri: input.redirectUri,
        codeVerifier: input.codeVerifier
      })
    );
  } catch (error) {
    return loginFlowError(error);
  }
}

function enabledSocialProviders(
  registered: NonNullable<ReturnType<AuthRegistry["get"]>>
): string[] {
  return Object.entries(registered.project.socialProviders)
    .filter(([, provider]) => provider.enabled && provider.clientId && provider.clientSecret)
    .map(([provider]) => provider);
}

function loginFlowError(error: unknown): Response {
  if (error instanceof LoginFlowError) {
    return json({ error: error.code }, error.status);
  }

  throw error;
}
