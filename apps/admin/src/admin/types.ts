import type { Theme } from "@nezdemkovski/auth-client-shared/theme";

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

export enum AuthConnectionKind {
  Application = "application",
  Service = "service",
  Advanced = "advanced"
}

export enum ServicePermission {
  BillingUsageWrite = "billing_usage_write"
}

export type AuthConnection = {
  clientId: string;
  name: string;
  kind: AuthConnectionKind;
  callbackUrl: string | null;
  permissions: ServicePermission[];
  disabled: boolean;
  canRotateCredential: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ServicePermissionCatalogItem = {
  id: ServicePermission;
  name: string;
  description: string;
};

export type AuthConnectionsResponse = {
  connections: AuthConnection[];
  catalog: {
    servicePermissions: ServicePermissionCatalogItem[];
  };
};

export type AuthConnectionCredential = {
  clientId: string;
  clientSecret?: string;
};

export type CreateApplicationConnectionInput = {
  name: string;
  kind: AuthConnectionKind.Application;
  appUrl: string;
};

export type CreateServiceConnectionInput = {
  name: string;
  kind: AuthConnectionKind.Service;
  permissions: ServicePermission[];
};

export type CreateAuthConnectionInput =
  | CreateApplicationConnectionInput
  | CreateServiceConnectionInput;

export type CreatedAuthConnection = {
  connection: AuthConnection;
  credential: AuthConnectionCredential;
};

export type SocialProviderId = "telegram" | "github" | "google" | "twitter" | "facebook";

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

export type ObservabilityProvider = "none" | "sentry";

export type PublicObservabilityConfig = {
  enabled: boolean;
  dsn: string;
  environment: string;
};

export type ObservabilitySettings = {
  provider: ObservabilityProvider;
  enabled: boolean;
  environment: string;
  dsnConfigured: boolean;
  configured: boolean;
  updatedAt: string | null;
};

export type ObservabilitySettingsPatch = {
  provider: ObservabilityProvider;
  enabled: boolean;
  environment: string;
  dsn?: string;
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

export type CatalogOption<T extends string> = {
  value: T;
  label: string;
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
  freeEntitlements?: BillingEntitlement[];
  products: BillingProductMapping[];
  webhookUrl: string;
  benefitPresets: BillingEntitlement[];
  grantTemplate: BillingEntitlement;
  catalog: {
    environments: Array<CatalogOption<BillingEnvironment>>;
    productTypes: Array<CatalogOption<BillingProductType>>;
    grantTypes: Array<CatalogOption<EntitlementGrantType>>;
    resetPeriods: Array<CatalogOption<EntitlementResetPeriod>>;
    recurringIntervals: Array<CatalogOption<"month" | "year">>;
  };
  templates: {
    createProduct: CreatePolarProductInput;
    product: BillingProductMapping;
    entitlement: BillingEntitlement;
  };
};

export type BillingSettingsPatch = {
  provider: BillingProvider;
  enabled: boolean;
  environment: BillingEnvironment;
  organizationId?: string;
  accessToken?: string;
  webhookSecret?: string;
  freeEntitlements?: BillingEntitlement[];
  products: BillingProductMapping[];
};

export type StorageProvider = "none" | "s3";

export type StorageSettings = {
  provider: StorageProvider;
  enabled: boolean;
  managed: boolean;
  endpoint: string;
  region: string;
  bucket: string;
  publicBaseUrl: string;
  accessKeyIdConfigured: boolean;
  secretAccessKeyConfigured: boolean;
  configured: boolean;
};

export type StorageSettingsPatch = {
  provider: StorageProvider;
  enabled: boolean;
  endpoint?: string;
  region?: string;
  bucket?: string;
  publicBaseUrl?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
};

export type StorageObject = {
  id: string;
  purpose: "project_icon" | "user_avatar";
  folder: "images" | "files";
  bucket: string;
  objectKey: string;
  publicUrl: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  ownerUserId: string | null;
  createdAt: string;
};

export type StorageObjectsResponse = {
  objects: StorageObject[];
};

export type UploadResponse = {
  upload: {
    bucket: string;
    objectKey: string;
    publicUrl: string;
    originalFileName: string;
    mimeType: string;
    sizeBytes: number;
    checksumSha256: string;
  };
  project?: ProjectSummary | null;
};

export type PolarProductSummary = {
  id: string;
  name: string;
  description: string;
  isRecurring: boolean;
  isArchived: boolean;
  organizationId: string;
  suggestedMapping: BillingProductMapping;
};

export type PolarProductsResponse = {
  products: PolarProductSummary[];
};

export type CreatePolarProductInput = {
  slug: string;
  name: string;
  description: string;
  type: Exclude<BillingProductType, "metered">;
  priceAmount: number;
  priceCurrency: string;
  recurringInterval: "month" | "year";
};

export type ProjectSettingsPatch = {
  name: string;
  description: string;
  iconUrl: string;
  appUrl: string;
  trustedOrigins: string[];
  features: ProjectFeatures;
};

export type CreateProjectInput = {
  slug: string;
  name: string;
  appUrl: string;
};

export type RealmSetup = {
  issuer: string;
  callbackUrl: string;
  clientId: string;
  mcp: {
    authorizationServer: string;
    discoveryUrl: string;
  };
};

export type CreatedProject = {
  project: ProjectSummary;
  setup: RealmSetup;
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
