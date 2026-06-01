import { useQuery } from "@tanstack/react-query";
import { Navigate, useParams } from "@tanstack/react-router";

import { Card, EmptyState, UsersSkeleton } from "@nezdemkovski/auth-ui";

import { fetchProjects, fetchStorageObjects } from "../api";
import { FilesView } from "../screens/FilesView";

export function ProjectFilesRoute() {
  const params = useParams({ strict: false });
  const projectsQuery = useQuery({
    queryKey: ["admin", "projects"],
    queryFn: fetchProjects
  });
  const selected = projectsQuery.data?.projects.find(
    (project) => project.slug === params.projectSlug
  );
  const storageObjectsQuery = useQuery({
    queryKey: ["admin", "storage-objects", selected?.slug],
    queryFn: () => fetchStorageObjects(selected!.slug),
    enabled: Boolean(selected?.slug)
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
    <FilesView
      project={selected}
      objects={storageObjectsQuery.data?.objects ?? []}
      loading={storageObjectsQuery.isLoading}
      error={storageObjectsQuery.isError ? "Could not load files." : null}
    />
  );
}
