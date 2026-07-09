import { Navigate, useParams } from "@tanstack/react-router";

import { Card, EmptyState, UsersSkeleton } from "@nezdemkovski/auth-ui";

import { ProjectView } from "../screens/ProjectView";
import type { StorageObject } from "../types";
import { useProjectRouteMutations } from "./projectMutations";
import { useProjectRouteQueries } from "./projectQueries";
import { rootRoute } from "./router";

export function ProjectRoute() {
  const params = useParams({ strict: false });

  return (
    <ProjectRouteContent
      key={params.projectSlug ?? "missing-project"}
      projectSlug={params.projectSlug}
    />
  );
}

function ProjectRouteContent({ projectSlug }: { projectSlug?: string }) {
  const { me } = rootRoute.useRouteContext();
  const {
    projectsQuery,
    selected,
    usersQuery,
    socialProvidersQuery,
    billingQuery,
    storageQuery,
    storageObjectsQuery,
    polarProductsQuery
  } = useProjectRouteQueries(projectSlug);
  const mutations = useProjectRouteMutations();

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
      socialProvidersQuery={socialProvidersQuery}
      billingQuery={billingQuery}
      storageQuery={storageQuery}
      polarProductsQuery={polarProductsQuery}
      emailServiceEnabled={me.emailServiceEnabled}
      resendPendingEmail={
        mutations.resendVerification.isPending
          ? mutations.resendVerification.variables?.email ?? null
          : null
      }
      resendErrorEmail={
        mutations.resendVerification.isError
          ? mutations.resendVerification.variables?.email ?? null
          : null
      }
      resentVerificationEmail={mutations.resentVerificationEmail}
      terminatePendingUserId={
        mutations.terminateSessions.isPending
          ? mutations.terminateSessions.variables?.userId ?? null
          : null
      }
      terminateErrorUserId={
        mutations.terminateSessions.isError
          ? mutations.terminateSessions.variables?.userId ?? null
          : null
      }
      terminatedSessionsUserId={mutations.terminatedSessionsUserId}
      updatePending={mutations.updateProject.isPending}
      updateError={
        mutations.updateProject.isError
          ? mutations.updateProject.error instanceof Error
            ? mutations.updateProject.error.message
            : "Could not save project settings"
          : null
      }
      socialProviderPending={
        mutations.socialProviderUpdate.isPending
          ? mutations.socialProviderUpdate.variables?.provider ?? null
          : null
      }
      socialProviderVerifyPending={
        mutations.socialProviderVerify.isPending
          ? mutations.socialProviderVerify.variables?.provider ?? null
          : null
      }
      socialProviderError={
        mutations.socialProviderUpdate.isError
          ? mutations.socialProviderUpdate.error instanceof Error
            ? mutations.socialProviderUpdate.error.message
            : "Could not save social provider"
          : mutations.socialProviderVerify.isError
          ? mutations.socialProviderVerify.error instanceof Error
            ? mutations.socialProviderVerify.error.message
            : "Provider check failed"
          : null
      }
      billingPending={mutations.billingUpdate.isPending}
      billingVerifyPending={mutations.billingVerify.isPending}
      billingError={
        mutations.billingUpdate.isError
          ? mutations.billingUpdate.error instanceof Error
            ? mutations.billingUpdate.error.message
            : "Could not save billing settings"
          : mutations.billingVerify.isError
          ? mutations.billingVerify.error instanceof Error
            ? mutations.billingVerify.error.message
            : "Polar check failed"
          : null
      }
      storagePending={mutations.storageUpdate.isPending}
      storageUploadPending={mutations.projectIconUpload.isPending}
      storageError={
        mutations.storageUpdate.isError
          ? mutations.storageUpdate.error instanceof Error
            ? mutations.storageUpdate.error.message
            : "Could not save storage settings"
          : null
      }
      storageUploadError={
        mutations.projectIconUpload.isError
          ? mutations.projectIconUpload.error instanceof Error
            ? mutations.projectIconUpload.error.message
            : "Could not upload app icon"
          : null
      }
      uploadedIcon={currentProjectIcon(storageObjectsQuery.data?.objects ?? [], selected.iconUrl)}
      polarProductCreatePending={mutations.polarProductCreate.isPending}
      polarProductCreateError={
        mutations.polarProductCreate.isError
          ? mutations.polarProductCreate.error instanceof Error
            ? mutations.polarProductCreate.error.message
            : "Could not create Polar product"
          : null
      }
      onResendVerification={(email) =>
        mutations.resendVerification.mutate({
          project: selected.slug,
          email
        })
      }
      onTerminateSessions={(userId) =>
        mutations.terminateSessions.mutate({
          project: selected.slug,
          userId
        })
      }
      onUpdateProject={(patch) =>
        mutations.updateProject.mutate({
          project: selected.slug,
          patch
        })
      }
      onUpdateSocialProvider={(provider, patch) =>
        mutations.socialProviderUpdate.mutate({
          project: selected.slug,
          provider,
          patch
        })
      }
      onVerifySocialProvider={(provider) =>
        mutations.socialProviderVerify.mutate({
          project: selected.slug,
          provider
        })
      }
      onUpdateBilling={(patch) =>
        mutations.billingUpdate.mutate({
          project: selected.slug,
          patch
        })
      }
      onVerifyBilling={(input) =>
        mutations.billingVerify.mutate({
          project: selected.slug,
          ...input
        })
      }
      onCreatePolarProduct={(product) =>
        mutations.polarProductCreate.mutateAsync({
          project: selected.slug,
          product
        })
      }
      onUpdateStorage={(patch) =>
        mutations.storageUpdate.mutate({
          project: selected.slug,
          patch
        })
      }
      onUploadProjectIcon={(file) =>
        mutations.projectIconUpload.mutate({
          project: selected.slug,
          file
        })
      }
    />
  );
}

const currentProjectIcon = (
  objects: StorageObject[],
  iconUrl: string
): StorageObject | null => {
  if (!iconUrl) {
    return null;
  }

  return (
    objects.find(
      (object) => object.purpose === "project_icon" && object.publicUrl === iconUrl
    ) ?? null
  );
};
