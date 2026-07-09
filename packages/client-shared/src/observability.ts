import * as Sentry from "@sentry/react";

export type BrowserObservabilityConfig = {
  enabled: boolean;
  dsn: string;
  environment: string;
  component: string;
  projectSlug?: string;
};

const SENSITIVE_URL_PARAMETERS = new Set([
  "access_token",
  "client_secret",
  "code",
  "code_verifier",
  "id_token",
  "password",
  "refresh_token",
  "state",
  "token"
]);

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
    beforeSend(event) {
      const request = event.request
        ? {
            ...event.request,
            url: event.request.url
              ? sanitizeObservabilityUrl(event.request.url)
              : event.request.url,
            query_string: undefined
          }
        : event.request;
      const breadcrumbs = event.breadcrumbs?.map((breadcrumb) => {
        const url = breadcrumb.data?.url;
        if (typeof url !== "string") {
          return breadcrumb;
        }

        return {
          ...breadcrumb,
          data: {
            ...breadcrumb.data,
            url: sanitizeObservabilityUrl(url)
          }
        };
      });

      return {
        ...event,
        request,
        breadcrumbs
      };
    },
    tracesSampleRate: 0
  });
};

export const sanitizeObservabilityUrl = (value: string) => {
  try {
    const url = new URL(value, "http://localhost");
    for (const parameter of SENSITIVE_URL_PARAMETERS) {
      url.searchParams.delete(parameter);
    }

    return url.origin === "http://localhost" && !value.startsWith("http")
      ? `${url.pathname}${url.search}${url.hash}`
      : url.toString();
  } catch {
    return "[redacted-invalid-url]";
  }
};

export const scrubSensitiveBrowserUrl = () => {
  const current = window.location.href;
  const sanitized = sanitizeObservabilityUrl(current);
  if (sanitized !== current) {
    window.history.replaceState(window.history.state, "", sanitized);
  }
};

export const setBrowserObservabilityProject = (projectSlug?: string) => {
  Sentry.setTag("projectSlug", projectSlug ?? "");
};
