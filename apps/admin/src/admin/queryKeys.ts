export const adminQueryKeys = {
  root: ["admin"],
  me: () => [...adminQueryKeys.root, "me"],
  projects: () => [...adminQueryKeys.root, "projects"],
  projectUsers: (project: string | undefined) => [
    ...adminQueryKeys.root,
    "project-users",
    project
  ],
  socialProviders: (project: string | undefined) => [
    ...adminQueryKeys.root,
    "social-providers",
    project
  ],
  authConnections: (project: string | undefined) => [
    ...adminQueryKeys.root,
    "auth-connections",
    project
  ],
  billing: (project: string | undefined) => [
    ...adminQueryKeys.root,
    "billing",
    project
  ],
  polarProducts: (project: string | undefined) => [
    ...adminQueryKeys.root,
    "polar-products",
    project
  ],
  storage: (project: string | undefined) => [
    ...adminQueryKeys.root,
    "storage",
    project
  ],
  storageObjects: (project: string | undefined) => [
    ...adminQueryKeys.root,
    "storage-objects",
    project
  ],
  deliverySettings: () => [...adminQueryKeys.root, "delivery-settings"],
  observabilityConfig: () => [...adminQueryKeys.root, "observability-config"],
  observabilitySettings: () => [...adminQueryKeys.root, "observability-settings"]
} as const;
