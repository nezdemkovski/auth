import type { Env, Hono } from "hono";
import { ErrorCode } from "../../runtime/error-codes";
import {
  LoginFlowError,
  type LoginProjectRegistry,
  resolveLoginNextAction
} from "./core";
import {
  LoginMode,
  loginNextActionResponse,
  loginConfigResponse,
  oauthConsentConfigResponse,
  resetPasswordConfigResponse
} from "./translator";

type PublicObservabilityReporter = {
  publicConfig(): {
    enabled: boolean;
    dsn: string;
    environment: string;
  };
};

export type LoginOptions = {
  registry: LoginProjectRegistry;
  trustProxyHeaders?: boolean;
  observabilityReporter: PublicObservabilityReporter;
};

export const registerLoginRoutes = <TEnv extends Env>(
  app: Hono<TEnv>,
  options: LoginOptions
) => {
  app.get("/api/:project/login/config/login", (c) =>
    getLoginConfig(c.req.raw, c.req.param("project"), options)
  );
  app.get("/api/:project/login/config/reset-password", (c) =>
    getPasswordResetConfig(c.req.raw, c.req.param("project"), options)
  );
  app.get("/api/:project/login/config/oauth-consent", (c) =>
    getOAuthConsentConfig(c.req.raw, c.req.param("project"), options)
  );

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

export const getLoginConfig = (req: Request, project: string, options: LoginOptions) => {
  const registered = options.registry.get(project);
  if (!registered) {
    return json({ error: ErrorCode.UnknownProject }, 404);
  }

  const url = new URL(req.url);
  const mode =
    url.searchParams.get("mode") === LoginMode.Signup
      ? LoginMode.Signup
      : LoginMode.Login;
  if (!url.searchParams.has("sig") || !url.searchParams.has("ba_param")) {
    return json({ error: ErrorCode.InvalidBody }, 400);
  }

  return runtimeConfig(
    loginConfigResponse({
      registered,
      project,
      mode,
      observability: options.observabilityReporter.publicConfig()
    })
  );
};

export const getPasswordResetConfig = (req: Request, project: string, options: LoginOptions) => {
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

export const getOAuthConsentConfig = (req: Request, project: string, options: LoginOptions) => {
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

export const getLoginNextAction = async (req: Request, project: string, options: LoginOptions) => {
  try {
    const action = await resolveLoginNextAction(options, {
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
