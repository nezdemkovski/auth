import { QueryClient } from "@tanstack/react-query";
import {
  RouterProvider,
  createRootRouteWithContext,
  createRoute,
  createRouter
} from "@tanstack/react-router";

import type { Theme } from "@nezdemkovski/auth-client-shared/theme";

import { DashboardLayout } from "./DashboardLayout";
import { NewProjectRoute } from "./NewProjectRoute";
import { OverviewRoute } from "./OverviewRoute";
import { ProjectFilesRoute } from "./ProjectFilesRoute";
import { ProjectRoute } from "./ProjectRoute";
import { SettingsRoute } from "./SettingsRoute";
import type { DashboardRouterContext, MeResponse } from "../types";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: true,
      retry: 1
    }
  }
});

export const rootRoute = createRootRouteWithContext<DashboardRouterContext>()({
  component: DashboardLayout
});

const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: OverviewRoute
});

const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectSlug",
  component: ProjectRoute
});

const projectFilesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectSlug/files",
  component: ProjectFilesRoute
});

const newProjectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/new",
  component: NewProjectRoute
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsRoute
});

const routeTree = rootRoute.addChildren([
  overviewRoute,
  newProjectRoute,
  projectFilesRoute,
  projectRoute,
  settingsRoute
]);

const adminRouter = createRouter({
  routeTree,
  basepath: "/admin",
  context: {
    me: {
      user: {
        id: "",
        email: "",
        name: ""
      },
      mustChangePassword: false,
      emailServiceEnabled: false
    },
    theme: "dark",
    onToggleTheme: () => {},
    onSignOut: () => {}
  }
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof adminRouter;
  }
}

export function DashboardShell({
  me,
  theme,
  onToggleTheme,
  onSignOut
}: {
  me: MeResponse;
  theme: Theme;
  onToggleTheme: () => void;
  onSignOut: () => void;
}) {
  return (
    <RouterProvider
      router={adminRouter}
      context={{
        me,
        theme,
        onToggleTheme,
        onSignOut
      }}
    />
  );
}
