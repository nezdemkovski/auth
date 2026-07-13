export enum OAuthClientProfile {
  Web = "web",
  Public = "public",
  Service = "service"
}

export type ManagedOAuthClient = {
  clientId: string;
  name: string;
  profile: OAuthClientProfile;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  scopes: string[];
  resources: string[];
  disabled: boolean;
  public: boolean;
  skipConsent: boolean;
  requirePkce: boolean;
  secretConfigured: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateManagedOAuthClientInput = {
  name: string;
  profile: OAuthClientProfile;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  scopes: string[];
  resources: string[];
  skipConsent?: boolean;
};

export type UpdateManagedOAuthClientInput = {
  name?: string;
  redirectUris?: string[];
  postLogoutRedirectUris?: string[];
  scopes?: string[];
  resources?: string[];
  skipConsent?: boolean;
};

export type ManagedOAuthClientCredential = {
  clientId: string;
  clientSecret?: string;
};

export type CreatedManagedOAuthClient = {
  client: ManagedOAuthClient;
  credential: ManagedOAuthClientCredential;
};

export type OAuthClientManagement = {
  list(): Promise<ManagedOAuthClient[]>;
  get(clientId: string): Promise<ManagedOAuthClient>;
  create(input: CreateManagedOAuthClientInput): Promise<CreatedManagedOAuthClient>;
  update(
    clientId: string,
    input: UpdateManagedOAuthClientInput
  ): Promise<ManagedOAuthClient>;
  setDisabled(clientId: string, disabled: boolean): Promise<ManagedOAuthClient>;
  rotateSecret(clientId: string): Promise<ManagedOAuthClientCredential>;
  delete(clientId: string): Promise<void>;
};
