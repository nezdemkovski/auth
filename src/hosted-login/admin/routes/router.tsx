import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet, RouterProvider, createRootRouteWithContext, createRoute, createRouter, useNavigate, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { fetchProjectUsers, fetchProjects, resendVerificationEmail, terminateUserSessions, updateProjectSettings } from "../api";
import { Topbar } from "../components/Topbar";
import { Card, EmptyState, FormAlert } from "../components/primitives";
import { UsersSkeleton } from "../components/Skeletons";
import { OverviewView } from "../screens/OverviewView";
import { ProjectView } from "../screens/ProjectView";
import type {
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

const routeTree = rootRoute.addChildren([overviewRoute, projectRoute]);

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
  const projects = projectsQuery.data?.projects ?? [];
  const selectedSlug = params.projectSlug ?? "__overview__";
  const selected = projects.find((project) => project.slug === selectedSlug);

  async function selectProject(slug: string) {
    if (slug === "__overview__") {
      await navigate({ to: "/" });
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
        projects={projects}
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

function OverviewRoute() {
  const projectsQuery = useQuery({
    queryKey: ["admin", "projects"],
    queryFn: fetchProjects
  });
  const navigate = useNavigate();
  const projects = projectsQuery.data?.projects ?? [];
  const totals = useMemo(() => {
    return projects.reduce(
      (acc, project) => {
        acc.users += project.userCount;
        acc.sessions += project.activeSessionCount;
        return acc;
      },
      { users: 0, sessions: 0 }
    );
  }, [projects]);

  return (
    <OverviewView
      loading={projectsQuery.isLoading}
      projects={projects}
      totals={totals}
      onOpenProject={(slug) =>
        void navigate({
          to: "/projects/$projectSlug",
          params: { projectSlug: slug }
        })
      }
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
