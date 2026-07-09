import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { configureBrowserObservability } from "@nezdemkovski/auth-client-shared/observability";
import { applyTheme, resolveTheme, setTheme, watchSystemTheme, type Theme } from "@nezdemkovski/auth-client-shared/theme";
import { UnauthorizedError, fetchMe, fetchObservabilityConfig, signOut } from "./api";
import { CenteredShell } from "./components/CenteredShell";
import { LoadingPanel } from "@nezdemkovski/auth-ui";
import { ChangePasswordPanel } from "./screens/ChangePasswordPanel";
import { SignInPanel } from "./screens/SignInPanel";
import { DashboardShell, queryClient } from "./routes/router";
import {
  AdminSessionState,
  subscribeAdminSession
} from "./api/shared";
import { Toaster } from "./toast";

export function AdminApp() {
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme());
  const [sessionInvalidated, setSessionInvalidated] = useState(false);

  const meQuery = useQuery({
    queryKey: ["admin", "me"],
    queryFn: fetchMe,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: true
  });
  const observabilityQuery = useQuery({
    queryKey: ["admin", "observability-config"],
    queryFn: fetchObservabilityConfig,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    return watchSystemTheme((next) => setThemeState(next));
  }, []);

  useEffect(() => {
    return subscribeAdminSession((state) => {
      const unauthorized = state === AdminSessionState.Unauthorized;
      setSessionInvalidated(unauthorized);
      if (unauthorized) {
        queryClient.removeQueries({
          predicate: (query) => query.queryKey[0] === "admin"
        });
      }
    });
  }, []);

  useEffect(() => {
    if (!observabilityQuery.data) {
      return;
    }

    configureBrowserObservability({
      ...observabilityQuery.data,
      component: "admin"
    });
  }, [observabilityQuery.data]);

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
    if (meQuery.isLoading && !sessionInvalidated) {
      return (
        <CenteredShell theme={theme} onToggleTheme={toggleTheme}>
          <LoadingPanel />
        </CenteredShell>
      );
    }

    if (sessionInvalidated || meQuery.isError || !meQuery.data) {
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
