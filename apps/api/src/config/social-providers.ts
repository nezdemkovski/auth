import { isEnumValue } from "../runtime/enums";

export enum SocialProvider {
  Telegram = "telegram",
  GitHub = "github",
  Google = "google",
  Twitter = "twitter",
  Facebook = "facebook"
}

export type SocialProviderId = SocialProvider;

export type SocialProviderCatalogItem = {
  id: SocialProviderId;
  label: string;
  shortLabel: string;
  clientIdLabel?: string;
  clientSecretLabel: string;
  defaultScopes: string[];
  docsUrl: string;
  requiresClientId: boolean;
};

export const SOCIAL_PROVIDER_CATALOG: Record<
  SocialProviderId,
  SocialProviderCatalogItem
> = {
  [SocialProvider.Telegram]: {
    id: SocialProvider.Telegram,
    label: "Telegram",
    shortLabel: "Telegram",
    clientIdLabel: "OIDC client ID",
    clientSecretLabel: "OIDC client secret",
    defaultScopes: ["openid", "profile"],
    docsUrl: "https://core.telegram.org/bots/telegram-login",
    requiresClientId: true
  },
  [SocialProvider.GitHub]: {
    id: SocialProvider.GitHub,
    label: "GitHub",
    shortLabel: "GitHub",
    clientIdLabel: "Client ID",
    clientSecretLabel: "Client secret",
    defaultScopes: ["read:user", "user:email"],
    docsUrl: "https://better-auth.com/docs/authentication/github",
    requiresClientId: true
  },
  [SocialProvider.Google]: {
    id: SocialProvider.Google,
    label: "Google",
    shortLabel: "Google",
    clientIdLabel: "Client ID",
    clientSecretLabel: "Client secret",
    defaultScopes: ["openid", "profile", "email"],
    docsUrl: "https://better-auth.com/docs/authentication/google",
    requiresClientId: true
  },
  [SocialProvider.Twitter]: {
    id: SocialProvider.Twitter,
    label: "X / Twitter",
    shortLabel: "X",
    clientIdLabel: "Client ID",
    clientSecretLabel: "Client secret",
    defaultScopes: ["users.read", "tweet.read", "offline.access", "users.email"],
    docsUrl: "https://better-auth.com/docs/authentication/twitter",
    requiresClientId: true
  },
  [SocialProvider.Facebook]: {
    id: SocialProvider.Facebook,
    label: "Facebook",
    shortLabel: "Facebook",
    clientIdLabel: "App ID",
    clientSecretLabel: "App secret",
    defaultScopes: ["email", "public_profile"],
    docsUrl: "https://better-auth.com/docs/authentication/facebook",
    requiresClientId: true
  }
};

export const SOCIAL_PROVIDER_IDS = Object.values(SocialProvider);

export const isSocialProviderId = (value: string): value is SocialProviderId => {
  return isEnumValue(SocialProvider, value);
};

export const isBuiltInSocialProvider = (
  provider: SocialProviderId
): provider is Exclude<SocialProviderId, SocialProvider.Telegram> => {
  return provider !== SocialProvider.Telegram;
};

export const isSocialProviderConfigured = (
  provider: SocialProviderId,
  settings: { clientId: string; clientSecret: string }
) => {
  const catalog = SOCIAL_PROVIDER_CATALOG[provider];
  return Boolean(settings.clientSecret && (!catalog.requiresClientId || settings.clientId));
};
