import type { AuthRegistry, RegisteredProject } from "../../auth/registry";

type LoginConfigInput = {
  registered: RegisteredProject;
  project: string;
  redirectUri: string;
  state: string;
  mode: "login" | "signup";
  codeChallenge: string;
};

type ResetPasswordConfigInput = {
  registered: RegisteredProject;
  project: string;
  token: string;
  error: string;
};

type OAuthConsentConfigInput = {
  registered: RegisteredProject;
  project: string;
  clientId: string;
  scopes: string[];
  oauthQuery: string;
};

export function loginConfigResponse(input: LoginConfigInput) {
  return {
    page: "login",
    project: input.project,
    projectName: input.registered.project.name,
    redirectUri: input.redirectUri,
    state: input.state,
    mode: input.mode,
    codeChallenge: input.codeChallenge,
    features: input.registered.project.features,
    socialProviders: enabledSocialProviders(input.registered)
  };
}

export function resetPasswordConfigResponse(input: ResetPasswordConfigInput) {
  return {
    page: "reset-password",
    project: input.project,
    projectName: input.registered.project.name,
    appUrl: input.registered.project.appUrl,
    token: input.token,
    error: input.error
  };
}

export function oauthConsentConfigResponse(input: OAuthConsentConfigInput) {
  return {
    page: "oauth-consent",
    project: input.project,
    projectName: input.registered.project.name,
    clientId: input.clientId,
    scopes: input.scopes,
    oauthQuery: input.oauthQuery
  };
}

export function enabledSocialProviders(
  registered: NonNullable<ReturnType<AuthRegistry["get"]>>
): string[] {
  return Object.entries(registered.project.socialProviders)
    .filter(([, provider]) => provider.enabled && provider.clientId && provider.clientSecret)
    .map(([provider]) => provider);
}
