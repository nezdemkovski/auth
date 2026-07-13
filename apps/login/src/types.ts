export type LoginConfig = {
  page?: "login";
  project: string;
  projectName: string;
  mode: "login" | "signup";
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

export type SocialProviderId = "telegram" | "github" | "google" | "twitter" | "facebook";

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
