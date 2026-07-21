import type { AuthConfiguration } from "../shared/config.js";

export type AuthUser = {
  id: string;
  name?: string;
  email?: string;
  emailVerified?: boolean;
  image?: string;
};

export type AuthSession = {
  user: AuthUser;
};

export type SignInOptions = {
  returnTo?: string;
};

export type TelegramMiniAppSignInOptions = SignInOptions & {
  initData: string;
};

export type AuthClientConfiguration = AuthConfiguration & {
  redirectUri?: string;
};

export type AuthClient = {
  initialize(): Promise<AuthSession | null>;
  signIn(options?: SignInOptions): Promise<void>;
  signInWithTelegramMiniApp(
    options: TelegramMiniAppSignInOptions
  ): Promise<void>;
  handleCallback(): Promise<AuthSession | null>;
  getSession(): AuthSession | null;
  getAccessToken(): Promise<string | null>;
  invalidateAccessToken(): void;
  signOut(): Promise<void>;
  subscribe(listener: (session: AuthSession | null) => void): () => void;
};

export type CreateAuthClient = (
  configuration: AuthClientConfiguration
) => AuthClient;

export declare const createAuthClient: CreateAuthClient;
