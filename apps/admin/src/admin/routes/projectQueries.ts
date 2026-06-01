import { useQuery } from "@tanstack/react-query";

import {
  fetchBillingSettings,
  fetchPolarProducts,
  fetchProjectUsers,
  fetchProjects,
  fetchSocialProviders,
  fetchStorageObjects,
  fetchStorageSettings
} from "../api";

export const useProjectRouteQueries = (projectSlug?: string) => {
  const projectsQuery = useQuery({
    queryKey: ["admin", "projects"],
    queryFn: fetchProjects
  });
  const selected = projectsQuery.data?.projects.find(
    (project) => project.slug === projectSlug
  );
  const usersQuery = useQuery({
    queryKey: ["admin", "project-users", selected?.slug],
    queryFn: () => fetchProjectUsers(selected!.slug),
    enabled: Boolean(selected?.slug)
  });
  const socialProvidersQuery = useQuery({
    queryKey: ["admin", "social-providers", selected?.slug],
    queryFn: () => fetchSocialProviders(selected!.slug),
    enabled: Boolean(selected?.slug)
  });
  const billingQuery = useQuery({
    queryKey: ["admin", "billing", selected?.slug],
    queryFn: () => fetchBillingSettings(selected!.slug),
    enabled: Boolean(selected?.slug)
  });
  const storageQuery = useQuery({
    queryKey: ["admin", "storage", selected?.slug],
    queryFn: () => fetchStorageSettings(selected!.slug),
    enabled: Boolean(selected?.slug)
  });
  const storageObjectsQuery = useQuery({
    queryKey: ["admin", "storage-objects", selected?.slug],
    queryFn: () => fetchStorageObjects(selected!.slug),
    enabled: Boolean(selected?.slug && selected.iconUrl)
  });
  const polarProductsQuery = useQuery({
    queryKey: ["admin", "polar-products", selected?.slug],
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
    billingQuery,
    storageQuery,
    storageObjectsQuery,
    polarProductsQuery
  };
};
