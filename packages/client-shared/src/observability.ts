import * as Sentry from "@sentry/react";

export type BrowserObservabilityConfig = {
  enabled: boolean;
  dsn: string;
  environment: string;
  component: string;
  projectSlug?: string;
};

let activeKey = "";

export const configureBrowserObservability = (
  config: BrowserObservabilityConfig
) => {
  const key = [
    config.enabled ? "enabled" : "disabled",
    config.dsn,
    config.environment,
    config.component,
    config.projectSlug ?? ""
  ].join("|");

  if (key === activeKey) {
    return;
  }

  activeKey = key;

  Sentry.init({
    dsn: config.dsn || undefined,
    enabled: config.enabled && Boolean(config.dsn),
    environment: config.environment,
    initialScope: {
      tags: {
        component: config.component,
        ...(config.projectSlug ? { projectSlug: config.projectSlug } : {})
      }
    },
    tracesSampleRate: 0
  });
};

export const setBrowserObservabilityProject = (projectSlug?: string) => {
  Sentry.setTag("projectSlug", projectSlug ?? "");
};
