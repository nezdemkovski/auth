import {
  ObservabilityProvider,
  type PlatformObservabilitySettings
} from "../../config/projects";
import { isEnumValue } from "../../runtime/enums";

export type ObservabilitySettingsPatch = {
  provider: PlatformObservabilitySettings["provider"];
  enabled: boolean;
  dsn?: string;
  environment: string;
};

type ObservabilitySettingsBody = Partial<
  Record<keyof ObservabilitySettingsPatch, unknown>
>;

export const parseObservabilitySettingsPatch = (
  body: ObservabilitySettingsBody
) => {
  if (
    typeof body.provider !== "string" ||
    !isEnumValue(ObservabilityProvider, body.provider) ||
    typeof body.enabled !== "boolean"
  ) {
    return null;
  }

  const patch: ObservabilitySettingsPatch = {
    provider: body.provider,
    enabled: body.enabled,
    environment:
      typeof body.environment === "string" && body.environment.trim()
        ? body.environment.trim()
        : "production"
  };

  if (typeof body.dsn === "string" && body.dsn.trim()) {
    patch.dsn = body.dsn.trim();
  }

  return patch;
};

export const validateObservabilitySettingsPatch = (
  patch: ObservabilitySettingsPatch,
  currentDsnConfigured: boolean
) => {
  if (!isEnumValue(ObservabilityProvider, patch.provider)) {
    throw new Error("Invalid observability provider");
  }

  if (patch.provider === ObservabilityProvider.None || !patch.enabled) {
    return;
  }

  if (patch.provider !== ObservabilityProvider.Sentry) {
    throw new Error("Invalid observability provider");
  }

  if (!patch.dsn && !currentDsnConfigured) {
    throw new Error("Sentry DSN is required");
  }

  if (patch.dsn) {
    validateSentryDsn(patch.dsn);
  }
};

export const validateSentryDsn = (dsn: string) => {
  const url = validateUrl(dsn, "Sentry DSN");
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Sentry DSN must use HTTP or HTTPS");
  }
  if (!url.username || !url.pathname.replace(/^\/+/, "")) {
    throw new Error("Invalid Sentry DSN");
  }
};

const validateUrl = (value: string, field: string) => {
  try {
    return new URL(value);
  } catch {
    throw new Error(`Invalid ${field}`);
  }
};
