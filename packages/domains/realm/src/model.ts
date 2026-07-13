import { SocialProvider, type SocialProviderId } from "./social-providers";

export type Realm = {
  slug: string;
  name: string;
  schema: string;
  description: string;
  iconUrl: string;
  appUrl: string;
  trustedOrigins: string[];
  features: RealmFeatures;
  socialProviders: RealmSocialProviders;
};

export type RealmFeatures = {
  passkey: {
    enabled: boolean;
  };
  twoFactor: {
    enabled: boolean;
    required: RealmTwoFactorRequirement;
  };
  agentAuth: {
    enabled: boolean;
    mode: RealmAgentAuthMode;
  };
  oauthProvider: {
    enabled: boolean;
    dynamicClientRegistration: boolean;
  };
};

export type RealmSocialProvider = {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  verifiedAt: string | null;
};

export type RealmSocialProviders = Record<SocialProviderId, RealmSocialProvider>;

export enum RealmTwoFactorRequirement {
  Optional = "optional",
  Admins = "admins",
  Everyone = "everyone"
}

export enum RealmAgentAuthMode {
  ReadOnly = "read-only",
  ScopedWrite = "scoped-write"
}

export const DEFAULT_REALM_FEATURES: RealmFeatures = {
  passkey: {
    enabled: false
  },
  twoFactor: {
    enabled: false,
    required: RealmTwoFactorRequirement.Optional
  },
  agentAuth: {
    enabled: false,
    mode: RealmAgentAuthMode.ReadOnly
  },
  oauthProvider: {
    enabled: false,
    dynamicClientRegistration: false
  }
};

const defaultSocialProvider = () => {
  return {
    enabled: false,
    clientId: "",
    clientSecret: "",
    verifiedAt: null
  };
};

export const DEFAULT_REALM_SOCIAL_PROVIDERS: RealmSocialProviders = {
  [SocialProvider.Telegram]: defaultSocialProvider(),
  [SocialProvider.GitHub]: defaultSocialProvider(),
  [SocialProvider.Google]: defaultSocialProvider(),
  [SocialProvider.Twitter]: defaultSocialProvider(),
  [SocialProvider.Facebook]: defaultSocialProvider()
};

export const ADMIN_REALM_SLUG = "admin";
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
export const MAX_REALM_SLUG_LENGTH = 58;
const MAX_POSTGRES_IDENTIFIER_BYTES = 63;

export const ADMIN_REALM: Realm = {
  slug: ADMIN_REALM_SLUG,
  name: "Auth Admin",
  schema: "auth_admin",
  description: "System admin realm for managing auth projects.",
  iconUrl: "",
  appUrl: "",
  trustedOrigins: [],
  features: DEFAULT_REALM_FEATURES,
  socialProviders: DEFAULT_REALM_SOCIAL_PROVIDERS
};

export const cloneDefaultRealmFeatures = () => {
  return structuredClone(DEFAULT_REALM_FEATURES);
};

export const cloneDefaultSocialProviders = () => {
  return structuredClone(DEFAULT_REALM_SOCIAL_PROVIDERS);
};

export const findRealm = (realms: Realm[], slug: string) => {
  return realms.find((realm) => realm.slug === slug) ?? null;
};

export const normalizeRealmSlug = (value: string) => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
};

export const realmSchemaFromSlug = (slug: string) => {
  return `${slug.replaceAll("-", "_")}_auth`;
};

export const validateRealmSlug = (slug: string) => {
  if (!SLUG_PATTERN.test(slug) || Buffer.byteLength(slug, "utf8") > MAX_REALM_SLUG_LENGTH) {
    throw new Error(`Invalid project slug: ${slug}`);
  }
};

export const validateRealmSchema = (schema: string) => {
  if (
    !IDENTIFIER_PATTERN.test(schema) ||
    Buffer.byteLength(schema, "utf8") > MAX_POSTGRES_IDENTIFIER_BYTES
  ) {
    throw new Error(`Invalid Postgres schema name: ${schema}`);
  }
};
