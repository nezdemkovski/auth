import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { fetchProjects } from "../api";
import { OverviewView } from "../screens/OverviewView";

export function OverviewRoute() {
  const projectsQuery = useQuery({
    queryKey: ["admin", "projects"],
    queryFn: fetchProjects
  });
  const navigate = useNavigate();
  const visibleProjects = useMemo(
    () => (projectsQuery.data?.projects ?? []).filter((project) => !project.system),
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
