import type { AuthRegistry, RegisteredProject } from "../../auth/registry";
import {
  SOCIAL_PROVIDER_CATALOG,
  type SocialProviderId
} from "../../config/social-providers";
import {
  ProjectTwoFactorRequirement
} from "../../config/projects";
import {
  mustEnrollTwoFactor,
  socialSignInAllowed
} from "../../auth/policy";

export enum LoginPage {
  Login = "login",
  ResetPassword = "reset-password",
  OAuthConsent = "oauth-consent"
}

export enum LoginMode {
  Login = "login",
  Signup = "signup"
}

export enum LoginNextAction {
  Redirect = "redirect",
  EnrollTwoFactor = "enroll_2fa",
  OfferPasskey = "offer_passkey"
}

export enum PkceChallengeMethod {
  S256 = "S256"
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
    socialProviders: enabledSocialProviders(input.registered).map((provider) => {
      const catalog = SOCIAL_PROVIDER_CATALOG[provider];
      return {
        id: catalog.id,
        label: catalog.label,
        shortLabel: catalog.shortLabel
      };
    }),
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
    scopeDescriptions: Object.fromEntries(
      input.scopes.map((scope) => [scope, describeOAuthScope(scope)])
    ),
    oauthQuery: input.oauthQuery,
    observability: input.observability
  };
};

export const loginNextActionResponse = (input: {
  project: Pick<RegisteredProject["project"], "features">;
  user: { role?: string | null; twoFactorEnabled?: boolean } | null;
  hasPasskeys: boolean;
}) => {
  if (mustEnrollTwoFactor(input.project.features.twoFactor, input.user)) {
    return { action: LoginNextAction.EnrollTwoFactor };
  }

  if (input.project.features.passkey.enabled && !input.hasPasskeys) {
    return { action: LoginNextAction.OfferPasskey };
  }

  return { action: LoginNextAction.Redirect };
};

export const enabledSocialProviders = (registered: Pick<NonNullable<ReturnType<AuthRegistry["get"]>>, "project">) => {
  if (!socialSignInAllowed(registered.project)) {
    return [];
  }

  return Object.entries(registered.project.socialProviders)
    .filter(([, provider]) => provider.enabled && provider.clientId && provider.clientSecret)
    .map(([provider]) => provider as SocialProviderId);
};

const describeOAuthScope = (scope: string) => {
  const normalized = scope.toLowerCase();
  const known: Record<string, { title: string; description: string }> = {
    openid: {
      title: "Sign you in",
      description: "Issue an OpenID identity token for this application."
    },
    profile: {
      title: "Read profile",
      description: "Access your basic profile details, such as name and avatar."
    },
    email: {
      title: "Read email",
      description: "Access your email address and verification status."
    },
    offline_access: {
      title: "Stay connected",
      description: "Issue refresh tokens so the client can keep working later."
    }
  };

  return (
    known[normalized] ?? {
      title: scope,
      description: "Access this application-specific permission."
    }
  );
};
