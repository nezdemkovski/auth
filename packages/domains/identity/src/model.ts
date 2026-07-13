export enum IdentityBootstrapKey {
  InitialAdmin = "initial_admin"
}

export type AdminProfilePatch = {
  name?: string;
  email?: string;
};

export type IdentityUserRow = {
  id: string;
  email: string;
  name: string;
  role: string | null;
  banned: boolean | null;
  emailVerified: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  sessionCount: number;
};

export type IdentityUserResponse = {
  id: string;
  email: string;
  name: string;
  role: string | null;
  banned: boolean;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  sessionCount: number;
};
