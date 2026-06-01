import { useQuery } from "@tanstack/react-query";
import { Outlet, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import { setBrowserObservabilityProject } from "@nezdemkovski/auth-client-shared/observability";
import { FormAlert } from "@nezdemkovski/auth-ui";

import { fetchProjects } from "../api";
import { Topbar } from "../components/Topbar";
import { rootRoute } from "./router";

const OVERVIEW_SLUG = "__overview__";
const SETTINGS_SLUG = "__settings__";
const NEW_PROJECT_SLUG = "__new_project__";

export function DashboardLayout() {
  const { me, theme, onToggleTheme, onSignOut } = rootRoute.useRouteContext();
  const projectsQuery = useQuery({
    queryKey: ["admin", "projects"],
    queryFn: fetchProjects
  });
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const allProjects = projectsQuery.data?.projects ?? [];
  const visibleProjects = useMemo(
    () => allProjects.filter((project) => !project.system),
    [allProjects]
  );
  const isSettings = pathname === "/settings" || pathname.endsWith("/settings");
  const isNewProject = pathname === "/projects/new" || pathname.endsWith("/projects/new");
  const selectedSlug = isSettings
    ? SETTINGS_SLUG
    : isNewProject
    ? NEW_PROJECT_SLUG
    : params.projectSlug ?? OVERVIEW_SLUG;
  const selected = allProjects.find((project) => project.slug === params.projectSlug);

  useEffect(() => {
    setBrowserObservabilityProject(selected?.slug);
  }, [selected?.slug]);

  const selectProject = async (slug: string) => {
    if (slug === OVERVIEW_SLUG) {
      await navigate({ to: "/" });
      return;
    }
    if (slug === SETTINGS_SLUG) {
      await navigate({ to: "/settings" });
      return;
    }
    if (slug === NEW_PROJECT_SLUG) {
      await navigate({ to: "/projects/new" });
      return;
    }
    await navigate({
      to: "/projects/$projectSlug",
      params: { projectSlug: slug }
    });
  };

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
