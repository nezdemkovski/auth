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
  system: boolean;
  userCount: number;
  activeSessionCount: number;
};

export type ProjectSettingsPatch = {
  name: string;
  description: string;
  iconUrl: string;
  appUrl: string;
  trustedOrigins: string[];
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

export type ViewState =
  | { status: "loading" }
  | { status: "signed-out"; error?: string }
  | { status: "force-change"; me: MeResponse; error?: string }
  | { status: "dashboard"; me: MeResponse };

export type DashboardRouterContext = {
  me: MeResponse;
  theme: Theme;
  onToggleTheme: () => void;
  onSignOut: () => void;
};
