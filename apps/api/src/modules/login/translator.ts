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
};

type ResetPasswordConfigInput = {
  registered: Pick<RegisteredProject, "project">;
  project: string;
  token: string;
  error: string;
};

type OAuthConsentConfigInput = {
  registered: Pick<RegisteredProject, "project">;
  project: string;
  clientId: string;
  scopes: string[];
  oauthQuery: string;
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
    socialProviders: enabledSocialProviders(input.registered)
  };
};

export const resetPasswordConfigResponse = (input: ResetPasswordConfigInput) => {
  return {
    page: LoginPage.ResetPassword,
    project: input.project,
    projectName: input.registered.project.name,
    appUrl: input.registered.project.appUrl,
    token: input.token,
    error: input.error
  };
};

export const oauthConsentConfigResponse = (input: OAuthConsentConfigInput) => {
  return {
    page: LoginPage.OAuthConsent,
    project: input.project,
    projectName: input.registered.project.name,
    clientId: input.clientId,
    scopes: input.scopes,
    oauthQuery: input.oauthQuery
  };
};

export const enabledSocialProviders = (registered: Pick<NonNullable<ReturnType<AuthRegistry["get"]>>, "project">) => {
  return Object.entries(registered.project.socialProviders)
    .filter(([, provider]) => provider.enabled && provider.clientId && provider.clientSecret)
    .map(([provider]) => provider);
};
