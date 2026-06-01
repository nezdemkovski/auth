import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { configureBrowserObservability } from "@nezdemkovski/auth-client-shared/observability";
import {
  applyTheme,
  resolveTheme,
  setTheme,
  type Theme
} from "@nezdemkovski/auth-client-shared/theme";

import { AuthHeading } from "./components/AuthHeading";
import { ErrorAlert, ThemeToggle } from "./components/shared";
import type { LoginAuthConfig } from "./types";

export function LoginConfigLoader({
  project,
  configPath,
  children
}: {
  project: string;
  configPath: "login" | "reset-password" | "oauth-consent";
  children: (config: LoginAuthConfig) => ReactNode;
}) {
  const [config, setConfig] = useState<LoginAuthConfig | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void loadLoginAuthConfig(project, configPath).then((loadedConfig) => {
      if (cancelled) {
        return;
      }

      if (!loadedConfig) {
        setFailed(true);
        return;
      }

      configureBrowserObservability({
        ...loadedConfig.observability,
        component: "login",
        projectSlug: loadedConfig.project
      });
      setConfig(loadedConfig);
      setFailed(false);
    });

    return () => {
      cancelled = true;
    };
  }, [project, configPath]);

  if (failed) {
    return <LoginConfigError />;
  }

  if (!config) {
    return null;
  }

  return <>{children(config)}</>;
}

async function loadLoginAuthConfig(
  project: string,
  configPath: "login" | "reset-password" | "oauth-consent"
) {
  const url = new URL(
    `/api/${project}/login/config/${configPath}`,
    window.location.origin
  );
  url.search = window.location.search;

  const response = await fetch(url, {
    credentials: "include"
  });

  if (!response.ok) {
    return null;
  }

  return response.json() as Promise<LoginAuthConfig>;
}

export function LoginConfigError() {
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  };

  return (
    <div className="relative min-h-screen">
      <div
        aria-hidden="true"
        data-grid-bg
        className="pointer-events-none absolute inset-0"
      />
      <header className="relative z-10 flex h-14 items-center justify-end px-6 lg:px-10">
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </header>
      <section className="relative z-10 grid min-h-[calc(100vh-3.5rem)] place-items-center px-5 py-8">
        <div className="w-full max-w-[440px]">
          <AuthHeading
            step="credentials"
            isSignup={false}
            subtitle="This auth page is missing the required runtime configuration."
          />
          <ErrorAlert>Cannot start.</ErrorAlert>
        </div>
      </section>
    </div>
  );
}
