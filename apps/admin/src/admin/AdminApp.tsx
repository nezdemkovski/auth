import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { applyTheme, resolveTheme, setTheme, watchSystemTheme, type Theme } from "@nezdemkovski/auth-client-shared/theme";
import { UnauthorizedError, fetchMe, signOut } from "./api";
import { CenteredShell } from "./components/CenteredShell";
import { LoadingPanel } from "./components/primitives";
import { ChangePasswordPanel } from "./screens/ChangePasswordPanel";
import { SignInPanel } from "./screens/SignInPanel";
import { DashboardShell } from "./routes/router";
import { Toaster } from "./toast";

export function AdminApp() {
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme());

  const meQuery = useQuery({
    queryKey: ["admin", "me"],
    queryFn: fetchMe,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false
  });

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

  return (
    <>
      {renderContent()}
      <Toaster />
    </>
  );

  function renderContent() {
    if (meQuery.isLoading) {
      return (
        <CenteredShell theme={theme} onToggleTheme={toggleTheme}>
          <LoadingPanel />
        </CenteredShell>
      );
    }

    if (meQuery.isError || !meQuery.data) {
      const isUnauthorized = meQuery.error instanceof UnauthorizedError;
      return (
        <CenteredShell theme={theme} onToggleTheme={toggleTheme}>
          <SignInPanel
            error={
              isUnauthorized
                ? undefined
                : meQuery.error instanceof Error
                ? meQuery.error.message
                : "Admin API is unavailable"
            }
          />
        </CenteredShell>
      );
    }

    const me = meQuery.data;

    if (me.mustChangePassword) {
      return (
        <CenteredShell theme={theme} onToggleTheme={toggleTheme}>
          <ChangePasswordPanel me={me} />
        </CenteredShell>
      );
    }

    return (
      <DashboardShell
        me={me}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSignOut={() => void signOut().then(() => meQuery.refetch())}
      />
    );
  }
}
