import type { AuthRegistry } from "../../auth/registry";
import type { Hono } from "hono";
import {
  LoginFlowError,
  LoginFlowService,
  type LoginProjectRegistry,
  redirectUriAllowed,
  validPkceChallenge
} from "./core";
import type { LoginCodeStore } from "./store";
import {
  parseLoginCodeExchangeInput,
  parseLoginSessionCodeInput
} from "./validator";
import {
  LoginMode,
  loginConfigResponse,
  oauthConsentConfigResponse,
  resetPasswordConfigResponse
} from "./translator";

type LoginVariables = {
  registry: AuthRegistry;
};

export type LoginOptions = {
  registry: LoginProjectRegistry;
  secret: string;
  codeStore: LoginCodeStore;
  trustProxyHeaders?: boolean;
};

type LoginConfigOptions = {
  registry: LoginProjectRegistry;
};

export const registerLoginRoutes = (app: Hono<{ Variables: LoginVariables }>, options: LoginOptions) => {
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
};

const json = (data: unknown, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff"
    }
  });
};

const runtimeConfig = (data: unknown, status = 200) => {
  return json(data, status);
};

export const getLoginConfig = (req: Request, project: string, options: LoginConfigOptions) => {
  const registered = options.registry.get(project);
  if (!registered) {
    return json({ error: "unknown_project" }, 404);
  }

  const url = new URL(req.url);
  const redirectUri = url.searchParams.get("redirect_uri") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const mode =
    url.searchParams.get("mode") === LoginMode.Signup
      ? LoginMode.Signup
      : LoginMode.Login;
  const codeChallenge = url.searchParams.get("code_challenge") ?? "";
  const codeChallengeMethod = url.searchParams.get("code_challenge_method") ?? "";

  if (!redirectUriAllowed(options.registry, project, redirectUri)) {
    return json({ error: "invalid_redirect_uri" }, 400);
  }

  if (codeChallengeMethod !== "S256" || !validPkceChallenge(codeChallenge)) {
    return json({ error: "invalid_pkce_challenge" }, 400);
  }

  return runtimeConfig(
    loginConfigResponse({
      registered,
      project,
      redirectUri,
      state,
      mode,
      codeChallenge
    })
  );
};

export const getPasswordResetConfig = (req: Request, project: string, options: LoginConfigOptions) => {
  const registered = options.registry.get(project);
  if (!registered) {
    return json({ error: "unknown_project" }, 404);
  }

  const url = new URL(req.url);

  return runtimeConfig(
    resetPasswordConfigResponse({
      registered,
      project,
      token: url.searchParams.get("token") ?? "",
      error: url.searchParams.get("error") ?? ""
    })
  );
};

export const getOAuthConsentConfig = (req: Request, project: string, options: LoginConfigOptions) => {
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

  return runtimeConfig(
    oauthConsentConfigResponse({
      registered,
      project,
      clientId,
      scopes,
      oauthQuery: url.searchParams.toString()
    })
  );
};

export const createLoginSessionCode = async (req: Request, project: string, options: LoginOptions) => {
  const input = parseLoginSessionCodeInput(await req.json().catch(() => null));
  if (!input) {
    return json({ error: "invalid_body" }, 400);
  }

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
};

export const exchangeLoginCode = async (req: Request, project: string, options: LoginOptions) => {
  const input = parseLoginCodeExchangeInput(await req.json().catch(() => null));
  if (!input) {
    return json({ error: "invalid_body" }, 400);
  }

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
};

const loginFlowError = (error: unknown) => {
  if (error instanceof LoginFlowError) {
    return json(
      {
        error: error.code,
        message: error.message
      },
      error.status
    );
  }

  throw error;
};
