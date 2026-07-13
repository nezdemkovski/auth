import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { createProject } from "../api";
import { adminQueryKeys } from "../queryKeys";
import { NewProjectView } from "../screens/NewProjectView";
import { notifyError, notifySuccess } from "../toast";
import type { CreateProjectInput } from "../types";

export function NewProjectRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: CreateProjectInput) => createProject(input),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.projects() });
      notifySuccess("Realm created", `${created.project.name} is ready.`);
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
      created={mutation.data ?? null}
      error={
        mutation.isError
          ? mutation.error instanceof Error
            ? mutation.error.message
            : "Could not create project"
          : null
      }
      onSubmit={(input) => mutation.mutate(input)}
      onOpenRealm={(projectSlug) =>
        void navigate({
          to: "/projects/$projectSlug",
          params: { projectSlug }
        })
      }
    />
  );
}
