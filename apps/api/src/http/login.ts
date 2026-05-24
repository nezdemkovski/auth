import type { AuthRegistry } from "../auth/registry";
import {
  createLoginCodeStore,
  internalAuthHeaders,
  LoginFlowError,
  LoginFlowService,
  pkceChallenge,
  redirectUriAllowed,
  validPkceChallenge,
  verifyPkce,
  type LoginCodeStore
} from "../services/core/login";

export { createLoginCodeStore };

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
  const body = await req.json().catch(() => null);
  const service = new LoginFlowService(options);

  try {
    return json(
      await service.createSessionCode({
        project,
        redirectUri:
          typeof body?.redirect_uri === "string" ? body.redirect_uri : "",
        state: typeof body?.state === "string" ? body.state : "",
        codeChallenge:
          typeof body?.code_challenge === "string" ? body.code_challenge : "",
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
  const body = await req.json().catch(() => null);
  const service = new LoginFlowService(options);

  try {
    return json(
      await service.exchangeCode({
        project,
        code: typeof body?.code === "string" ? body.code : "",
        redirectUri:
          typeof body?.redirect_uri === "string" ? body.redirect_uri : "",
        codeVerifier:
          typeof body?.code_verifier === "string" ? body.code_verifier : ""
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

export const __loginTestUtils = {
  createLoginCodeStore,
  internalAuthHeaders,
  pkceChallenge,
  redirectUriAllowed,
  validPkceChallenge,
  verifyPkce
};
