import * as Sentry from "@sentry/bun";
import type {
  AdminDatabase,
  AdminSchema
} from "@nezdemkovski/auth-platform-database";

import {
  DEFAULT_PLATFORM_OBSERVABILITY,
  ObservabilityComponent,
  ObservabilityProvider,
  type ObservabilityCaptureContext,
  type PlatformObservabilitySettings
} from "./model";
import {
  observabilitySettingsResponse,
  publicObservabilityConfig
} from "./translator";
import {
  readObservabilitySettings,
  readObservabilitySettingsState,
  updateObservabilitySettings
} from "./store";
import type { ObservabilitySettingsPatch } from "./validator";

export class ObservabilityServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400
  ) {
    super(message);
    this.name = "ObservabilityServiceError";
  }
}

export class ObservabilityReporter {
  private settings: PlatformObservabilitySettings;

  constructor(settings: PlatformObservabilitySettings) {
    this.settings = settings;
    this.configureSentry();
  }

  updateSettings(settings: PlatformObservabilitySettings) {
    this.settings = settings;
    this.configureSentry();
  }

  publicConfig() {
    return publicObservabilityConfig(this.settings);
  }

  captureException(error: unknown, context: ObservabilityCaptureContext) {
    if (!this.enabled()) {
      return;
    }

    Sentry.withScope((scope) => {
      this.applyContext(scope, context);
      Sentry.captureException(error);
    });
  }

  async captureMessage(message: string, context: ObservabilityCaptureContext) {
    if (!this.enabled()) {
      throw new ObservabilityServiceError(
        "observability_not_configured",
        "Observability is not configured",
        409
      );
    }

    Sentry.withScope((scope) => {
      this.applyContext(scope, context);
      Sentry.captureMessage(message);
    });
    await Sentry.flush(2_000);
  }

  private enabled() {
    return (
      this.settings.provider === ObservabilityProvider.Sentry &&
      this.settings.enabled &&
      Boolean(this.settings.dsn)
    );
  }

  private configureSentry() {
    Sentry.init({
      dsn: this.settings.dsn || undefined,
      enabled: this.enabled(),
      environment: this.settings.environment,
      tracesSampleRate: 0
    });
  }

  private applyContext(
    scope: Sentry.Scope,
    context: ObservabilityCaptureContext
  ) {
    scope.setTag("component", context.component);
    if (context.projectSlug) scope.setTag("projectSlug", context.projectSlug);
    if (context.routeArea) scope.setTag("routeArea", context.routeArea);
    if (context.method) scope.setTag("method", context.method);
    if (context.status) scope.setTag("status", String(context.status));
    if (context.path) {
      scope.setContext("request", {
        path: context.path
      });
    }
  }
}

type ObservabilityDatabaseOptions = {
  databaseUrl: string;
  adminProject: AdminSchema;
  adminDb?: AdminDatabase;
  encryptionSecret: string;
};

export class ObservabilityService {
  constructor(
    private readonly options: ObservabilityDatabaseOptions & {
      reporter: ObservabilityReporter;
    }
  ) {}

  async readSettings() {
    return observabilitySettingsResponse(
      await readObservabilitySettingsState(this.options)
    );
  }

  publicConfig() {
    return this.options.reporter.publicConfig();
  }

  async updateSettings(patch: ObservabilitySettingsPatch) {
    try {
      const settings = await updateObservabilitySettings({
        ...this.options,
        patch
      });
      this.options.reporter.updateSettings(settings);
      return this.readSettings();
    } catch (error) {
      throw new ObservabilityServiceError(
        "invalid_observability_settings",
        error instanceof Error ? error.message : "Invalid observability settings"
      );
    }
  }

  async sendTestEvent() {
    await this.options.reporter.captureMessage("Auth observability test event", {
      component: ObservabilityComponent.Admin,
      routeArea: "settings"
    });
  }
}

export const createObservabilityReporter = async (
  options: ObservabilityDatabaseOptions & {
    onSettingsLoadError?: (error: unknown) => void;
  }
) => {
  try {
    return new ObservabilityReporter(await readObservabilitySettings(options));
  } catch (error) {
    options.onSettingsLoadError?.(error);
    return new ObservabilityReporter(DEFAULT_PLATFORM_OBSERVABILITY);
  }
};
