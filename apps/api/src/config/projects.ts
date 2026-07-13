import {
  SOCIAL_PROVIDER_IDS,
  SocialProvider,
  type SocialProviderId
} from "./social-providers";

export type AuthProject = {
  slug: string;
  name: string;
  schema: string;
  description: string;
  iconUrl: string;
  appUrl: string;
  trustedOrigins: string[];
  features: ProjectFeatures;
  socialProviders: ProjectSocialProviders;
  billing: ProjectBillingSettings;
  storage: ProjectStorageSettings;
};

export type ProjectFeatures = {
  passkey: {
    enabled: boolean;
  };
  twoFactor: {
    enabled: boolean;
    required: ProjectTwoFactorRequirement;
  };
  agentAuth: {
    enabled: boolean;
    mode: ProjectAgentAuthMode;
  };
  oauthProvider: {
    enabled: boolean;
    dynamicClientRegistration: boolean;
  };
};

export type ProjectSocialProvider = {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  verifiedAt: string | null;
};

export type ProjectSocialProviders = Record<SocialProviderId, ProjectSocialProvider>;

export enum ProjectTwoFactorRequirement {
  Optional = "optional",
  Admins = "admins",
  Everyone = "everyone"
}

export enum ProjectAgentAuthMode {
  ReadOnly = "read-only",
  ScopedWrite = "scoped-write"
}

export enum AuthUserRole {
  Admin = "admin",
  User = "user"
}

export enum BillingProvider {
  None = "none",
  Polar = "polar"
}

export enum BillingEnvironment {
  Sandbox = "sandbox",
  Production = "production"
}

export enum BillingProductType {
  Subscription = "subscription",
  OneTime = "one_time",
  CreditPack = "credit_pack",
  Lifetime = "lifetime",
  Metered = "metered"
}

export enum BillingRecurringInterval {
  Month = "month",
  Year = "year"
}

export enum EntitlementGrantType {
  Boolean = "boolean",
  RecurringQuota = "recurring_quota",
  OneTimeCredits = "one_time_credits",
  Lifetime = "lifetime",
  Metered = "metered"
}

export enum EntitlementResetPeriod {
  Never = "never",
  Monthly = "monthly",
  Yearly = "yearly"
}

export type BillingEntitlement = {
  key: string;
  grantType: EntitlementGrantType;
  amount: number | null;
  resetPeriod: EntitlementResetPeriod;
  priority: number;
};

export type BillingProductMapping = {
  slug: string;
  name: string;
  description: string;
  productId: string;
  type: BillingProductType;
  active: boolean;
  entitlements: BillingEntitlement[];
};

export type ProjectBillingSettings = {
  provider: BillingProvider;
  enabled: boolean;
  environment: BillingEnvironment;
  organizationId: string;
  accessToken: string;
  webhookSecret: string;
  freeEntitlements: BillingEntitlement[];
  products: BillingProductMapping[];
};

export enum StorageProvider {
  None = "none",
  S3 = "s3"
}

export type ProjectStorageSettings = {
  provider: StorageProvider;
  enabled: boolean;
  managed: boolean;
  endpoint: string;
  region: string;
  bucket: string;
  publicBaseUrl: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export const DEFAULT_PROJECT_BILLING: ProjectBillingSettings = {
  provider: BillingProvider.None,
  enabled: false,
  environment: BillingEnvironment.Sandbox,
  organizationId: "",
  accessToken: "",
  webhookSecret: "",
  freeEntitlements: [],
  products: []
};

export const DEFAULT_PROJECT_STORAGE: ProjectStorageSettings = {
  provider: StorageProvider.None,
  enabled: false,
  managed: false,
  endpoint: "",
  region: "auto",
  bucket: "",
  publicBaseUrl: "",
  accessKeyId: "",
  secretAccessKey: ""
};

export const DEFAULT_PROJECT_FEATURES: ProjectFeatures = {
  passkey: {
    enabled: false
  },
  twoFactor: {
    enabled: false,
    required: ProjectTwoFactorRequirement.Optional
  },
  agentAuth: {
    enabled: false,
    mode: ProjectAgentAuthMode.ReadOnly
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

export const DEFAULT_PROJECT_SOCIAL_PROVIDERS: ProjectSocialProviders = {
  [SocialProvider.Telegram]: defaultSocialProvider(),
  [SocialProvider.GitHub]: defaultSocialProvider(),
  [SocialProvider.Google]: defaultSocialProvider(),
  [SocialProvider.Twitter]: defaultSocialProvider(),
  [SocialProvider.Facebook]: defaultSocialProvider()
};

export const ADMIN_PROJECT_SLUG = "admin";
export const DEFAULT_BILLING_PRODUCT_SLUG = "product";

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
export const MAX_PROJECT_SLUG_LENGTH = 58;
const MAX_POSTGRES_IDENTIFIER_BYTES = 63;

export const ADMIN_PROJECT: AuthProject = {
  slug: ADMIN_PROJECT_SLUG,
  name: "Auth Admin",
  schema: "auth_admin",
  description: "System admin realm for managing auth projects.",
  iconUrl: "",
  appUrl: "",
  trustedOrigins: [],
  features: DEFAULT_PROJECT_FEATURES,
  socialProviders: DEFAULT_PROJECT_SOCIAL_PROVIDERS,
  billing: DEFAULT_PROJECT_BILLING,
  storage: DEFAULT_PROJECT_STORAGE
};

export const findProject = (projects: AuthProject[], slug: string) => {
  return projects.find((project) => project.slug === slug) ?? null;
};

export const normalizeProjectSlug = (value: string) => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
};

export const projectSchemaFromSlug = (slug: string) => {
  return `${slug.replaceAll("-", "_")}_auth`;
};

export const validateProjectSlug = (slug: string) => {
  if (!SLUG_PATTERN.test(slug) || Buffer.byteLength(slug, "utf8") > MAX_PROJECT_SLUG_LENGTH) {
    throw new Error(`Invalid project slug: ${slug}`);
  }
};

export const validateProjectSchema = (schema: string) => {
  if (
    !IDENTIFIER_PATTERN.test(schema) ||
    Buffer.byteLength(schema, "utf8") > MAX_POSTGRES_IDENTIFIER_BYTES
  ) {
    throw new Error(`Invalid Postgres schema name: ${schema}`);
  }
};
