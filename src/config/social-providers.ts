export const SocialProvider = {
  GitHub: "github",
  Google: "google",
  Twitter: "twitter",
  Facebook: "facebook"
} as const;

export type SocialProviderId = (typeof SocialProvider)[keyof typeof SocialProvider];

export type SocialProviderCatalogItem = {
  id: SocialProviderId;
  label: string;
  shortLabel: string;
  clientIdLabel: string;
  clientSecretLabel: string;
  defaultScopes: string[];
  docsUrl: string;
};

export const SOCIAL_PROVIDER_CATALOG: Record<
  SocialProviderId,
  SocialProviderCatalogItem
> = {
  github: {
    id: "github",
    label: "GitHub",
    shortLabel: "GitHub",
    clientIdLabel: "Client ID",
    clientSecretLabel: "Client secret",
    defaultScopes: ["read:user", "user:email"],
    docsUrl: "https://better-auth.com/docs/authentication/github"
  },
  google: {
    id: "google",
    label: "Google",
    shortLabel: "Google",
    clientIdLabel: "Client ID",
    clientSecretLabel: "Client secret",
    defaultScopes: ["openid", "profile", "email"],
    docsUrl: "https://better-auth.com/docs/authentication/google"
  },
  twitter: {
    id: "twitter",
    label: "X / Twitter",
    shortLabel: "X",
    clientIdLabel: "Client ID",
    clientSecretLabel: "Client secret",
    defaultScopes: ["users.read", "tweet.read", "offline.access", "users.email"],
    docsUrl: "https://better-auth.com/docs/authentication/twitter"
  },
  facebook: {
    id: "facebook",
    label: "Facebook",
    shortLabel: "Facebook",
    clientIdLabel: "App ID",
    clientSecretLabel: "App secret",
    defaultScopes: ["email", "public_profile"],
    docsUrl: "https://better-auth.com/docs/authentication/facebook"
  }
};

export const SOCIAL_PROVIDER_IDS = Object.values(SocialProvider);

export function isSocialProviderId(value: string): value is SocialProviderId {
  return SOCIAL_PROVIDER_IDS.includes(value as SocialProviderId);
}
