import type { AuthRegistry, RegisteredProject } from "../../auth/registry";
import {
  isSocialProviderConfigured,
  SOCIAL_PROVIDER_CATALOG,
  SOCIAL_PROVIDER_IDS
} from "@nezdemkovski/auth-realm";
import {
  ProjectTwoFactorRequirement
} from "../../config/projects";
import {
  mustEnrollTwoFactor,
  socialSignInAllowed
} from "@nezdemkovski/auth-better-auth-runtime";

export enum LoginPage {
  Login = "login",
  ResetPassword = "reset-password",
  OAuthConsent = "oauth-consent"
}

export enum LoginNextAction {
  Redirect = "redirect",
  EnrollTwoFactor = "enroll_2fa",
  OfferPasskey = "offer_passkey"
}

export enum LoginMode {
  Login = "login",
  Signup = "signup"
}

type LoginConfigInput = {
  registered: Pick<RegisteredProject, "project">;
  project: string;
  mode: LoginMode;
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
    mode: input.mode,
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

  return SOCIAL_PROVIDER_IDS
    .filter((provider) => {
      const settings = registered.project.socialProviders[provider];
      return (
        settings.enabled &&
        isSocialProviderConfigured(provider, settings)
      );
    });
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
