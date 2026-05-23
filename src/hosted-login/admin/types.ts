import type { Theme } from "../theme";

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  role?: string | null;
};

export type MeResponse = {
  user: AdminUser;
  mustChangePassword: boolean;
  emailServiceEnabled: boolean;
};

export type ProjectSummary = {
  slug: string;
  name: string;
  schema: string;
  description: string;
  iconUrl: string;
  appUrl: string;
  trustedOrigins: string[];
  features: ProjectFeatures;
  socialProviders: PublicSocialProviderSettings[];
  system: boolean;
  userCount: number;
  activeSessionCount: number;
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

export type SocialProviderId = "github" | "google" | "twitter" | "facebook";

export type SocialProviderCatalogItem = {
  id: SocialProviderId;
  label: string;
  shortLabel: string;
  clientIdLabel: string;
  clientSecretLabel: string;
  defaultScopes: string[];
  docsUrl: string;
};

export type PublicSocialProviderSettings = {
  provider: SocialProviderId;
  enabled: boolean;
  clientId: string;
  configured: boolean;
  verifiedAt: string | null;
  callbackUrl: string;
};

export type SocialProvidersResponse = {
  providers: PublicSocialProviderSettings[];
  catalog: SocialProviderCatalogItem[];
};

export type SocialProviderPatch = {
  enabled: boolean;
  clientId: string;
  clientSecret?: string;
};

export type DeliveryProvider = "none" | "cloudflare" | "resend";

export type DeliverySettings = {
  provider: DeliveryProvider;
  from: string;
  cloudflareAccountId: string;
  cloudflareApiTokenConfigured: boolean;
  resendApiKeyConfigured: boolean;
  configured: boolean;
  updatedAt: string | null;
};

export type DeliverySettingsPatch = {
  provider: DeliveryProvider;
  from: string;
  cloudflareAccountId: string;
  cloudflareApiToken?: string;
  resendApiKey?: string;
};

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

export type BillingSettings = {
  provider: BillingProvider;
  enabled: boolean;
  environment: BillingEnvironment;
  organizationId: string;
  accessTokenConfigured: boolean;
  webhookSecretConfigured: boolean;
  products: BillingProductMapping[];
  webhookUrl: string;
};

export type BillingSettingsPatch = {
  provider: BillingProvider;
  enabled: boolean;
  environment: BillingEnvironment;
  organizationId: string;
  accessToken?: string;
  webhookSecret?: string;
  products: BillingProductMapping[];
};

export type ProjectSettingsPatch = {
  name: string;
  description: string;
  iconUrl: string;
  appUrl: string;
  trustedOrigins: string[];
  features: ProjectFeatures;
};

export type CreateProjectInput = Omit<ProjectSettingsPatch, "features"> & {
  slug: string;
  features?: ProjectFeatures;
};

export type ProjectUser = AdminUser & {
  banned: boolean;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  sessionCount: number;
};

export type ProjectsResponse = {
  projects: ProjectSummary[];
};

export type ProjectUsersResponse = {
  project: {
    slug: string;
    name: string;
    schema: string;
    description: string;
    iconUrl: string;
    appUrl: string;
    trustedOrigins: string[];
    system: boolean;
  };
  users: ProjectUser[];
};

export type DashboardRouterContext = {
  me: MeResponse;
  theme: Theme;
  onToggleTheme: () => void;
  onSignOut: () => void;
};
