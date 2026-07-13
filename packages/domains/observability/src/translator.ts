import { ObservabilityProvider } from "./model";
import type { ObservabilitySettingsState } from "./store";

export const observabilitySettingsResponse = (
  settings: ObservabilitySettingsState
) => {
  const configured =
    settings.provider === ObservabilityProvider.Sentry &&
    settings.enabled &&
    settings.dsnConfigured;

  return {
    ...settings,
    configured
  };
};

export const publicObservabilityConfig = (settings: {
  provider: ObservabilityProvider;
  enabled: boolean;
  dsn: string;
  environment: string;
}) => {
  const configured =
    settings.provider === ObservabilityProvider.Sentry &&
    settings.enabled &&
    Boolean(settings.dsn);

  return {
    enabled: configured,
    dsn: configured ? settings.dsn : "",
    environment: settings.environment
  };
};
