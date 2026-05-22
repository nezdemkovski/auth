import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, Outlet, RouterProvider, createRootRouteWithContext, createRoute, createRouter, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { createProject, fetchProjectUsers, fetchProjects, resendVerificationEmail, terminateUserSessions, updateProjectSettings } from "../api";
import { Topbar } from "../components/Topbar";
import { Card, EmptyState, FormAlert } from "../components/primitives";
import { UsersSkeleton } from "../components/Skeletons";
import { OverviewView } from "../screens/OverviewView";
import { NewProjectView } from "../screens/NewProjectView";
import { ProjectView } from "../screens/ProjectView";
import { SettingsView } from "../screens/SettingsView";
import type {
  CreateProjectInput,
  DashboardRouterContext,
  MeResponse,
  ProjectSettingsPatch
} from "../types";
import type { Theme } from "../../theme";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

const rootRoute = createRootRouteWithContext<DashboardRouterContext>()({
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

function DashboardLayout() {
  const { me, theme, onToggleTheme, onSignOut } = rootRoute.useRouteContext();
  const projectsQuery = useQuery({
    queryKey: ["admin", "projects"],
    queryFn: fetchProjects
  });
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { projectSlug?: string };
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const allProjects = projectsQuery.data?.projects ?? [];
  const visibleProjects = useMemo(
    () => allProjects.filter((project) => !project.system),
    [allProjects]
  );
  const isSettings = pathname === "/settings" || pathname.endsWith("/settings");
  const isNewProject = pathname === "/projects/new" || pathname.endsWith("/projects/new");
  const selectedSlug = isSettings
    ? "__settings__"
    : isNewProject
    ? "__new_project__"
    : params.projectSlug ?? "__overview__";
  const selected = allProjects.find((project) => project.slug === params.projectSlug);

  async function selectProject(slug: string) {
    if (slug === "__overview__") {
      await navigate({ to: "/" });
      return;
    }
    if (slug === "__settings__") {
      await navigate({ to: "/settings" });
      return;
    }
    if (slug === "__new_project__") {
      await navigate({ to: "/projects/new" });
      return;
    }
    await navigate({
      to: "/projects/$projectSlug",
      params: { projectSlug: slug }
    });
  }

  return (
    <div className="min-h-screen bg-bg">
      <Topbar
        selected={selected}
        selectedSlug={selectedSlug}
        isSettings={isSettings}
        isNewProject={isNewProject}
        projects={visibleProjects}
        loading={projectsQuery.isLoading}
        onSelect={(slug) => void selectProject(slug)}
        syncedAt={projectsQuery.dataUpdatedAt || Date.now()}
        me={me}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onSignOut={onSignOut}
      />

      <main className="mx-auto w-full max-w-[1120px] px-6 py-8 lg:px-10 lg:py-10">
        {projectsQuery.isError ? (
          <FormAlert>Could not load admin data.</FormAlert>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}

function NewProjectRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: CreateProjectInput) => createProject(input),
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "projects"] });
      await navigate({
        to: "/projects/$projectSlug",
        params: { projectSlug: project.slug }
      });
    }
  });

  return (
    <NewProjectView
      pending={mutation.isPending}
      error={
        mutation.isError
          ? mutation.error instanceof Error
            ? mutation.error.message
            : "Could not create project"
          : null
      }
      onSubmit={(input) => mutation.mutate(input)}
    />
  );
}

function SettingsRoute() {
  const { me } = rootRoute.useRouteContext();
  return <SettingsView me={me} />;
}

function OverviewRoute() {
  const projectsQuery = useQuery({
    queryKey: ["admin", "projects"],
    queryFn: fetchProjects
  });
  const navigate = useNavigate();
  const visibleProjects = useMemo(
    () => (projectsQuery.data?.projects ?? []).filter((p) => !p.system),
    [projectsQuery.data?.projects]
  );
  const totals = useMemo(() => {
    return visibleProjects.reduce(
      (acc, project) => {
        acc.users += project.userCount;
        acc.sessions += project.activeSessionCount;
        return acc;
      },
      { users: 0, sessions: 0 }
    );
  }, [visibleProjects]);

  return (
    <OverviewView
      loading={projectsQuery.isLoading}
      projects={visibleProjects}
      totals={totals}
      onOpenProject={(slug) =>
        void navigate({
          to: "/projects/$projectSlug",
          params: { projectSlug: slug }
        })
      }
      onCreateProject={() => void navigate({ to: "/projects/new" })}
    />
  );
}

function ProjectRoute() {
  const { me } = rootRoute.useRouteContext();
  const params = useParams({ from: projectRoute.id });
  const queryClient = useQueryClient();
  const [resentVerificationEmail, setResentVerificationEmail] = useState<string | null>(
    null
  );
  const [terminatedSessionsUserId, setTerminatedSessionsUserId] = useState<
    string | null
  >(null);
  const projectsQuery = useQuery({
    queryKey: ["admin", "projects"],
    queryFn: fetchProjects
  });
  const selected = projectsQuery.data?.projects.find(
    (project) => project.slug === params.projectSlug
  );
  const usersQuery = useQuery({
    queryKey: ["admin", "project-users", selected?.slug],
    queryFn: () => fetchProjectUsers(selected!.slug),
    enabled: Boolean(selected?.slug)
  });
  const resendVerification = useMutation({
    mutationFn: (input: { project: string; email: string }) =>
      resendVerificationEmail(input.project, input.email),
    onSuccess: async (_data, variables) => {
      setResentVerificationEmail(variables.email);
      await queryClient.invalidateQueries({
        queryKey: ["admin", "project-users", variables.project]
      });
    }
  });
  const terminateSessions = useMutation({
    mutationFn: (input: { project: string; userId: string }) =>
      terminateUserSessions(input.project, input.userId),
    onSuccess: async (_data, variables) => {
      setTerminatedSessionsUserId(variables.userId);
      await queryClient.invalidateQueries({
        queryKey: ["admin", "project-users", variables.project]
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin", "projects"]
      });
    }
  });
  const updateProject = useMutation({
    mutationFn: (input: { project: string; patch: ProjectSettingsPatch }) =>
      updateProjectSettings(input.project, input.patch),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ["admin", "projects"]
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin", "project-users", variables.project]
      });
    }
  });

  if (projectsQuery.isLoading) {
    return <UsersSkeleton />;
  }

  if (selected?.system) {
    return <Navigate to="/settings" />;
  }

  if (!selected) {
    return (
      <Card>
        <EmptyState
          title="Project not found"
          description="The selected project no longer exists."
        />
      </Card>
    );
  }

  return (
    <ProjectView
      project={selected}
      usersQuery={usersQuery}
      emailServiceEnabled={me.emailServiceEnabled}
      resendPendingEmail={
        resendVerification.isPending
          ? resendVerification.variables?.email ?? null
          : null
      }
      resendErrorEmail={
        resendVerification.isError ? resendVerification.variables?.email ?? null : null
      }
      resentVerificationEmail={resentVerificationEmail}
      terminatePendingUserId={
        terminateSessions.isPending ? terminateSessions.variables?.userId ?? null : null
      }
      terminateErrorUserId={
        terminateSessions.isError ? terminateSessions.variables?.userId ?? null : null
      }
      terminatedSessionsUserId={terminatedSessionsUserId}
      updatePending={updateProject.isPending}
      updateError={
        updateProject.isError
          ? updateProject.error instanceof Error
            ? updateProject.error.message
            : "Could not save project settings"
          : null
      }
      onResendVerification={(email) =>
        resendVerification.mutate({
          project: selected.slug,
          email
        })
      }
      onTerminateSessions={(userId) =>
        terminateSessions.mutate({
          project: selected.slug,
          userId
        })
      }
      onUpdateProject={(patch) =>
        updateProject.mutate({
          project: selected.slug,
          patch
        })
      }
    />
  );
}
