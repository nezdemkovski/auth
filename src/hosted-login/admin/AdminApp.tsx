import { useEffect, useState } from "react";

import { applyTheme, resolveTheme, setTheme, watchSystemTheme, type Theme } from "../theme";
import { loadSession, signOut } from "./api";
import { CenteredShell } from "./components/CenteredShell";
import { LoadingPanel } from "./components/primitives";
import { ChangePasswordPanel } from "./screens/ChangePasswordPanel";
import { SignInPanel } from "./screens/SignInPanel";
import { DashboardShell } from "./routes/router";
import type { ViewState } from "./types";

export function AdminApp() {
  const [view, setView] = useState<ViewState>({ status: "loading" });
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme());

  useEffect(() => {
    void loadSession().then(setView);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    return watchSystemTheme((next) => setThemeState(next));
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  }

  if (view.status === "loading") {
    return (
      <CenteredShell theme={theme} onToggleTheme={toggleTheme}>
        <LoadingPanel />
      </CenteredShell>
    );
  }

  if (view.status === "signed-out") {
    return (
      <CenteredShell theme={theme} onToggleTheme={toggleTheme}>
        <SignInPanel error={view.error} onDone={setView} />
      </CenteredShell>
    );
  }

  if (view.status === "force-change") {
    return (
      <CenteredShell theme={theme} onToggleTheme={toggleTheme}>
        <ChangePasswordPanel
          me={view.me}
          error={view.error}
          onDone={setView}
        />
      </CenteredShell>
    );
  }

  return (
    <DashboardShell
      me={view.me}
      theme={theme}
      onToggleTheme={toggleTheme}
      onSignOut={() => void signOut().then(() => setView({ status: "signed-out" }))}
    />
  );
}
