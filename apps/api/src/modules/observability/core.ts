import * as Sentry from "@sentry/bun";

import {
  DEFAULT_PLATFORM_OBSERVABILITY,
  ObservabilityProvider,
  type AuthProject,
  type PlatformObservabilitySettings
} from "../../config/projects";
import type { AdminDatabase } from "../../db/admin-pool";
import { logError } from "../../runtime/logger";
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

export enum ObservabilityComponent {
  Api = "api",
  Admin = "admin",
  Login = "login"
}

export type ObservabilityCaptureContext = {
  component: ObservabilityComponent;
  projectSlug?: string;
  routeArea?: string;
  method?: string;
  path?: string;
  status?: number;
};

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
        path: normalizePath(context.path)
      });
    }
  }
}

export class ObservabilityService {
  constructor(
    private readonly options: {
      databaseUrl: string;
      adminProject: AuthProject;
      adminDb?: AdminDatabase;
      encryptionSecret: string;
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

export const createObservabilityReporter = async (options: {
  databaseUrl: string;
  adminProject: AuthProject;
  adminDb?: AdminDatabase;
  encryptionSecret: string;
}) => {
  try {
    return new ObservabilityReporter(await readObservabilitySettings(options));
  } catch (error) {
    logError("observability_settings_load_failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    return new ObservabilityReporter(DEFAULT_PLATFORM_OBSERVABILITY);
  }
};

export const inferObservabilityContext = (request: Request) => {
  const url = new URL(request.url);
  const path = url.pathname;
  return {
    component: ObservabilityComponent.Api,
    method: request.method,
    path,
    projectSlug: projectSlugFromPath(path),
    routeArea: routeAreaFromPath(path)
  };
};

const projectSlugFromPath = (path: string) => {
  const match = path.match(/^\/api\/([^/]+)\//);
  return match?.[1];
};

const routeAreaFromPath = (path: string) => {
  if (path.startsWith("/admin/api")) return "admin";
  if (/^\/api\/[^/]+\/login\//.test(path)) return "login";
  if (/^\/api\/[^/]+\/auth\//.test(path)) return "auth-proxy";
  if (/^\/api\/[^/]+\/storage\//.test(path)) return "storage";
  return "platform";
};

const normalizePath = (path: string) => {
  return path.replace(/^\/api\/[^/]+\//, "/api/:project/");
};
