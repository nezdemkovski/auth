export enum ObservabilityProvider {
  None = "none",
  Sentry = "sentry"
}

export enum ObservabilityComponent {
  Api = "api",
  Admin = "admin",
  Login = "login"
}

export type PlatformObservabilitySettings = {
  provider: ObservabilityProvider;
  enabled: boolean;
  dsn: string;
  environment: string;
};

export type ObservabilityCaptureContext = {
  component: ObservabilityComponent;
  projectSlug?: string;
  routeArea?: string;
  method?: string;
  path?: string;
  status?: number;
};

export const DEFAULT_PLATFORM_OBSERVABILITY: PlatformObservabilitySettings = {
  provider: ObservabilityProvider.None,
  enabled: false,
  dsn: "",
  environment: "production"
};

export function isObservabilityProvider(
  value: string
): value is ObservabilityProvider {
  return Object.values(ObservabilityProvider).some(
    (provider) => provider === value
  );
}
