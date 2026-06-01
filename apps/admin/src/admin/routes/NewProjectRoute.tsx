import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { createProject } from "../api";
import { NewProjectView } from "../screens/NewProjectView";
import { notifyError, notifySuccess } from "../toast";
import type { CreateProjectInput } from "../types";

export function NewProjectRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: CreateProjectInput) => createProject(input),
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "projects"] });
      notifySuccess("Realm created", `${project.name} is ready.`);
      await navigate({
        to: "/projects/$projectSlug",
        params: { projectSlug: project.slug }
      });
    },
    onError: (caught) => {
      notifyError(
        "Could not create realm",
        caught instanceof Error ? caught.message : undefined
      );
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
