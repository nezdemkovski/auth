import { useQuery } from "@tanstack/react-query";

import {
  fetchAuthConnections,
  fetchBillingSettings,
  fetchPolarProducts,
  fetchProjectUsers,
  fetchProjects,
  fetchSocialProviders,
  fetchStorageObjects,
  fetchStorageSettings,
  fetchTelegramMiniAppConnection
} from "../api";
import { adminQueryKeys } from "../queryKeys";

export const useProjectRouteQueries = (projectSlug?: string) => {
  const projectsQuery = useQuery({
    queryKey: adminQueryKeys.projects(),
    queryFn: fetchProjects
  });
  const selected = projectsQuery.data?.projects.find(
    (project) => project.slug === projectSlug
  );
  const usersQuery = useQuery({
    queryKey: adminQueryKeys.projectUsers(selected?.slug),
    queryFn: () => fetchProjectUsers(selected!.slug),
    enabled: Boolean(selected?.slug)
  });
  const socialProvidersQuery = useQuery({
    queryKey: adminQueryKeys.socialProviders(selected?.slug),
    queryFn: () => fetchSocialProviders(selected!.slug),
    enabled: Boolean(selected?.slug)
  });
  const authConnectionsQuery = useQuery({
    queryKey: adminQueryKeys.authConnections(selected?.slug),
    queryFn: () => fetchAuthConnections(selected!.slug),
    enabled: Boolean(selected?.slug)
  });
  const telegramMiniAppQuery = useQuery({
    queryKey: adminQueryKeys.telegramMiniApp(selected?.slug),
    queryFn: () => fetchTelegramMiniAppConnection(selected!.slug),
    enabled: Boolean(selected?.slug)
  });
  const billingQuery = useQuery({
    queryKey: adminQueryKeys.billing(selected?.slug),
    queryFn: () => fetchBillingSettings(selected!.slug),
    enabled: Boolean(selected?.slug)
  });
  const storageQuery = useQuery({
    queryKey: adminQueryKeys.storage(selected?.slug),
    queryFn: () => fetchStorageSettings(selected!.slug),
    enabled: Boolean(selected?.slug)
  });
  const storageObjectsQuery = useQuery({
    queryKey: adminQueryKeys.storageObjects(selected?.slug),
    queryFn: () => fetchStorageObjects(selected!.slug),
    enabled: Boolean(selected?.slug && selected.iconUrl)
  });
  const polarProductsQuery = useQuery({
    queryKey: adminQueryKeys.polarProducts(selected?.slug),
    queryFn: () => fetchPolarProducts(selected!.slug),
    enabled: Boolean(
      selected?.slug &&
        billingQuery.data?.enabled &&
        billingQuery.data?.accessTokenConfigured
    )
  });

  return {
    projectsQuery,
    selected,
    usersQuery,
    socialProvidersQuery,
    authConnectionsQuery,
    telegramMiniAppQuery,
    billingQuery,
    storageQuery,
    storageObjectsQuery,
    polarProductsQuery
  };
};
