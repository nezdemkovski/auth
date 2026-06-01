export type LoginConfig = {
  page?: "login";
  project: string;
  projectName: string;
  redirectUri: string;
  state: string;
  mode: "login" | "signup";
  codeChallenge: string;
  features: ProjectFeatures;
  socialProviders: SocialProviderConfig[];
  observability: PublicObservabilityConfig;
  error?: string;
};

export type LoginOAuthConsentConfig = {
  page: "oauth-consent";
  project: string;
  projectName: string;
  clientId: string;
  scopes: string[];
  scopeDescriptions: Record<string, ScopeDescription>;
  oauthQuery: string;
  observability: PublicObservabilityConfig;
};

export type LoginPasswordResetConfig = {
  page: "reset-password";
  project: string;
  projectName: string;
  appUrl: string;
  token: string;
  observability: PublicObservabilityConfig;
  error?: string;
};

export type LoginAuthConfig =
  | LoginConfig
  | LoginOAuthConsentConfig
  | LoginPasswordResetConfig;

export type SocialProviderId = "github" | "google" | "twitter" | "facebook";

export type SocialProviderConfig = {
  id: SocialProviderId;
  label: string;
  shortLabel: string;
};

export type ScopeDescription = {
  title: string;
  description: string;
};

export type PublicObservabilityConfig = {
  enabled: boolean;
  dsn: string;
  environment: string;
};

export type ProjectFeatures = {
  passkey: {
    enabled: boolean;
  };
  twoFactor: {
    enabled: boolean;
    required: "optional" | "admins" | "everyone";
  };
  agentAuth: {
    enabled: boolean;
    mode: "read-only" | "scoped-write";
  };
};

export type AuthStep =
  | "credentials"
  | "forgot-password"
  | "reset-sent"
  | "two-factor"
  | "two-factor-enroll"
  | "passkey-enroll"
  | "redirecting";
