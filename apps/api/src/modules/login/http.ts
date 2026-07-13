import type { AuthRegistry } from "../../auth/registry";
import type { ObservabilityReporter } from "../observability/core";
import type { Hono } from "hono";
import { cors } from "hono/cors";
import { ErrorCode } from "../../runtime/error-codes";
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
  loginNextActionResponse,
  loginConfigResponse,
  PkceChallengeMethod,
  oauthConsentConfigResponse,
  resetPasswordConfigResponse
} from "./translator";

type LoginVariables = {
  registry: AuthRegistry;
};

type PublicObservabilityReporter = Pick<ObservabilityReporter, "publicConfig">;

export type LoginOptions = {
  registry: LoginProjectRegistry;
  secret: string;
  codeStore: LoginCodeStore;
  trustProxyHeaders?: boolean;
  observabilityReporter: PublicObservabilityReporter;
};

type LoginConfigOptions = {
  registry: LoginProjectRegistry;
  observabilityReporter: PublicObservabilityReporter;
};

export const registerLoginRoutes = (app: Hono<{ Variables: LoginVariables }>, options: LoginOptions) => {
  app.use(
    "/api/:project/login/token",
    cors({
      origin: (origin, c) => {
        const project = c.req.param("project");
        return project && options.registry.isTrustedOrigin(project, origin) ? origin : "";
      },
      allowHeaders: ["Content-Type"],
      allowMethods: ["POST", "OPTIONS"],
      maxAge: 600
    })
  );

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

  app.get("/api/:project/login/next-action", (c) => {
    return getLoginNextAction(c.req.raw, c.req.param("project"), options);
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
    return json({ error: ErrorCode.UnknownProject }, 404);
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
  const oauthProviderFlow =
    url.searchParams.has("sig") && url.searchParams.has("ba_param");

  if (
    !oauthProviderFlow &&
    !redirectUriAllowed(options.registry, project, redirectUri)
  ) {
    return json({ error: ErrorCode.InvalidRedirectUri }, 400);
  }

  if (
    !oauthProviderFlow &&
    (codeChallengeMethod !== PkceChallengeMethod.S256 ||
      !validPkceChallenge(codeChallenge))
  ) {
    return json({ error: ErrorCode.InvalidPkceChallenge }, 400);
  }

  return runtimeConfig(
    loginConfigResponse({
      registered,
      project,
      redirectUri,
      state,
      mode,
      codeChallenge,
      oauthProviderFlow,
      observability: options.observabilityReporter.publicConfig()
    })
  );
};

export const getPasswordResetConfig = (req: Request, project: string, options: LoginConfigOptions) => {
  const registered = options.registry.get(project);
  if (!registered) {
    return json({ error: ErrorCode.UnknownProject }, 404);
  }

  const url = new URL(req.url);

  return runtimeConfig(
    resetPasswordConfigResponse({
      registered,
      project,
      token: url.searchParams.get("token") ?? "",
      error: url.searchParams.get("error") ?? "",
      observability: options.observabilityReporter.publicConfig()
    })
  );
};

export const getOAuthConsentConfig = (req: Request, project: string, options: LoginConfigOptions) => {
  const registered = options.registry.get(project);
  if (!registered) {
    return json({ error: ErrorCode.UnknownProject }, 404);
  }

  if (!registered.project.features.oauthProvider.enabled) {
    return json({ error: ErrorCode.NotFound }, 404);
  }

  const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id") ?? "";
  const scopes = (url.searchParams.get("scope") ?? "")
    .split(" ")
    .map((scope) => scope.trim())
    .filter(Boolean);

  if (!clientId) {
    return json({ error: ErrorCode.MissingClientId }, 400);
  }

  return runtimeConfig(
    oauthConsentConfigResponse({
      registered,
      project,
      clientId,
      scopes,
      observability: options.observabilityReporter.publicConfig()
    })
  );
};

export const createLoginSessionCode = async (req: Request, project: string, options: LoginOptions) => {
  const input = parseLoginSessionCodeInput(await req.json().catch(() => null));
  if (!input) {
    return json({ error: ErrorCode.InvalidBody }, 400);
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

export const getLoginNextAction = async (req: Request, project: string, options: LoginOptions) => {
  const service = new LoginFlowService(options);

  try {
    const action = await service.nextAction({
      project,
      headers: req.headers
    });
    return json(
      loginNextActionResponse({
        project: action.registered.project,
        user: action.user,
        hasPasskeys: action.hasPasskeys
      })
    );
  } catch (error) {
    return loginFlowError(error);
  }
};

export const exchangeLoginCode = async (req: Request, project: string, options: LoginOptions) => {
  const input = parseLoginCodeExchangeInput(await req.json().catch(() => null));
  if (!input) {
    return json({ error: ErrorCode.InvalidBody }, 400);
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
