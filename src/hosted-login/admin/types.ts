import type { Theme } from "../theme";

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  role?: string | null;
};

export type MeResponse = {
  user: AdminUser;
  mustChangePassword: boolean;
  emailServiceEnabled: boolean;
};

export type ProjectSummary = {
  slug: string;
  name: string;
  schema: string;
  description: string;
  iconUrl: string;
  appUrl: string;
  trustedOrigins: string[];
  features: ProjectFeatures;
  system: boolean;
  userCount: number;
  activeSessionCount: number;
};

export type ProjectFeatures = {
  passkey: {
    enabled: boolean;
  };
  twoFactor: {
    enabled: boolean;
    required: "optional" | "admins" | "everyone";
  };
  agentAuth: {
    enabled: boolean;
    mode: "read-only" | "scoped-write";
  };
};

export type ProjectSettingsPatch = {
  name: string;
  description: string;
  iconUrl: string;
  appUrl: string;
  trustedOrigins: string[];
  features: ProjectFeatures;
};

export type CreateProjectInput = Omit<ProjectSettingsPatch, "features"> & {
  slug: string;
  features?: ProjectFeatures;
};

export type ProjectUser = AdminUser & {
  banned: boolean;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  sessionCount: number;
};

export type ProjectsResponse = {
  projects: ProjectSummary[];
};

export type ProjectUsersResponse = {
  project: {
    slug: string;
    name: string;
    schema: string;
    description: string;
    iconUrl: string;
    appUrl: string;
    trustedOrigins: string[];
    system: boolean;
  };
  users: ProjectUser[];
};

export type DashboardRouterContext = {
  me: MeResponse;
  theme: Theme;
  onToggleTheme: () => void;
  onSignOut: () => void;
};
