import type { AuthRegistry, RegisteredProject } from "../../auth/registry";

export enum LoginPage {
  Login = "login",
  ResetPassword = "reset-password",
  OAuthConsent = "oauth-consent"
}

export enum LoginMode {
  Login = "login",
  Signup = "signup"
}

type LoginConfigInput = {
  registered: Pick<RegisteredProject, "project">;
  project: string;
  redirectUri: string;
  state: string;
  mode: LoginMode;
  codeChallenge: string;
  observability: PublicObservabilityConfig;
};

type ResetPasswordConfigInput = {
  registered: Pick<RegisteredProject, "project">;
  project: string;
  token: string;
  error: string;
  observability: PublicObservabilityConfig;
};

type OAuthConsentConfigInput = {
  registered: Pick<RegisteredProject, "project">;
  project: string;
  clientId: string;
  scopes: string[];
  oauthQuery: string;
  observability: PublicObservabilityConfig;
};

type PublicObservabilityConfig = {
  enabled: boolean;
  dsn: string;
  environment: string;
};

export const loginConfigResponse = (input: LoginConfigInput) => {
  return {
    page: LoginPage.Login,
    project: input.project,
    projectName: input.registered.project.name,
    redirectUri: input.redirectUri,
    state: input.state,
    mode: input.mode,
    codeChallenge: input.codeChallenge,
    features: input.registered.project.features,
    socialProviders: enabledSocialProviders(input.registered),
    observability: input.observability
  };
};

export const resetPasswordConfigResponse = (input: ResetPasswordConfigInput) => {
  return {
    page: LoginPage.ResetPassword,
    project: input.project,
    projectName: input.registered.project.name,
    appUrl: input.registered.project.appUrl,
    token: input.token,
    error: input.error,
    observability: input.observability
  };
};

export const oauthConsentConfigResponse = (input: OAuthConsentConfigInput) => {
  return {
    page: LoginPage.OAuthConsent,
    project: input.project,
    projectName: input.registered.project.name,
    clientId: input.clientId,
    scopes: input.scopes,
    oauthQuery: input.oauthQuery,
    observability: input.observability
  };
};

export const enabledSocialProviders = (registered: Pick<NonNullable<ReturnType<AuthRegistry["get"]>>, "project">) => {
  return Object.entries(registered.project.socialProviders)
    .filter(([, provider]) => provider.enabled && provider.clientId && provider.clientSecret)
    .map(([provider]) => provider);
};
