import { SOCIAL_PROVIDER_IDS, type SocialProviderId } from "./social-providers";

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
    required: "optional" | "admins" | "everyone";
  };
  agentAuth: {
    enabled: boolean;
    mode: "read-only" | "scoped-write";
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

export type BillingProvider = "none" | "polar";
export type BillingEnvironment = "sandbox" | "production";
export type BillingProductType =
  | "subscription"
  | "one_time"
  | "credit_pack"
  | "lifetime"
  | "metered";
export type EntitlementGrantType =
  | "boolean"
  | "recurring_quota"
  | "one_time_credits"
  | "lifetime"
  | "metered";
export type EntitlementResetPeriod = "never" | "monthly" | "yearly";

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
  products: BillingProductMapping[];
};

export type StorageProvider = "none" | "s3";

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
  provider: "none",
  enabled: false,
  environment: "sandbox",
  organizationId: "",
  accessToken: "",
  webhookSecret: "",
  products: []
};

export const DEFAULT_PROJECT_STORAGE: ProjectStorageSettings = {
  provider: "none",
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
    required: "optional"
  },
  agentAuth: {
    enabled: false,
    mode: "read-only"
  },
  oauthProvider: {
    enabled: false,
    dynamicClientRegistration: false
  }
};

export const DEFAULT_PROJECT_SOCIAL_PROVIDERS = Object.fromEntries(
  SOCIAL_PROVIDER_IDS.map((provider) => [
    provider,
    {
      enabled: false,
      clientId: "",
      clientSecret: "",
      verifiedAt: null
    }
  ])
) as ProjectSocialProviders;

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

export const ADMIN_PROJECT: AuthProject = {
  slug: "admin",
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

export function findProject(projects: AuthProject[], slug: string): AuthProject | null {
  return projects.find((project) => project.slug === slug) ?? null;
}

export function normalizeProjectSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function projectSchemaFromSlug(slug: string): string {
  return `${slug.replaceAll("-", "_")}_auth`;
}

export function validateProjectSlug(slug: string): void {
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(`Invalid project slug: ${slug}`);
  }
}

export function validateProjectSchema(schema: string): void {
  if (!IDENTIFIER_PATTERN.test(schema)) {
    throw new Error(`Invalid Postgres schema name: ${schema}`);
  }
}
