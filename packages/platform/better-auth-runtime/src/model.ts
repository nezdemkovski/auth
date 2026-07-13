import type { ResourceServerMetadata } from "@better-auth/oauth-provider";
import type { OAuthClientManagement } from "@nezdemkovski/auth-oauth-client-management";
import type { Realm } from "@nezdemkovski/auth-realm";
import type { BetterAuthOptions } from "better-auth";
import type { ResourceRequestInput } from "better-auth/oauth2";

export enum AuthUserRole {
  Admin = "admin",
  User = "user"
}

export type ProjectAuthPlugin = NonNullable<
  NonNullable<BetterAuthOptions["plugins"]>[number]
>;

export type ProjectAuthPluginContribution<TProject extends Realm = Realm> = (
  project: TProject
) => ProjectAuthPlugin[];

export type ProjectAuthEmailOptions = {
  emailAndPassword?: Omit<
    NonNullable<BetterAuthOptions["emailAndPassword"]>,
    "enabled"
  >;
  emailVerification?: BetterAuthOptions["emailVerification"];
  user?: BetterAuthOptions["user"];
};

export type ProjectAuthEmailContribution<TProject extends Realm = Realm> = (
  project: TProject
) => ProjectAuthEmailOptions;

export type OAuthResourceDefinition = {
  identifier: string;
  allowedScopes: string[];
};

export type ProjectAuthProtocolOptions<TProject extends Realm = Realm> = {
  oauthProvider: {
    scopes: string[];
    dynamicClientScopes: string[];
    resources(project: TProject): OAuthResourceDefinition[];
    userAccessTokenClaims: Readonly<Record<string, string>>;
    serviceAccessTokenClaims: Readonly<Record<string, string>>;
  };
};

export type ProjectAuthSession = {
  user: {
    id: string;
    email: string;
    name: string;
    role?: string | null;
    twoFactorEnabled?: boolean;
  };
  session: {
    id: string;
  };
} | null;

export type ProjectAuth = {
  handler(request: Request): Promise<Response>;
  oauthClientManagement: OAuthClientManagement;
  authorizationServerMetadata(request: Request): Promise<Response>;
  openIdConfiguration(request: Request): Promise<Response>;
  getProtectedResourceMetadata(
    metadata: ResourceServerMetadata
  ): Promise<ResourceServerMetadata>;
  verifyAccessTokenRequest(
    request: ResourceRequestInput,
    options: {
      jwksUrl: string;
      issuer: string;
      audience: string;
      scopes: string[];
    }
  ): Promise<Record<string, unknown>>;
  api: {
    getSession(input: { headers: Headers }): Promise<ProjectAuthSession>;
    getAgentConfiguration(input: { headers: Headers }): Promise<unknown>;
    createUser(input: {
      body: {
        email: string;
        name: string;
        password: string;
        role: AuthUserRole;
      };
    }): Promise<{ user: { id: string } }>;
    changeEmail(input: {
      headers: Headers;
      body: {
        newEmail: string;
        callbackURL: string;
      };
    }): Promise<unknown>;
    changePassword(input: {
      headers: Headers;
      body: {
        currentPassword: string;
        newPassword: string;
        revokeOtherSessions: boolean;
      };
    }): Promise<unknown>;
    verifyPassword(input: {
      headers: Headers;
      body: {
        password: string;
      };
    }): Promise<{ status?: boolean } | null>;
    sendVerificationEmail(input: {
      body: {
        email: string;
        callbackURL?: string;
      };
    }): Promise<unknown>;
    signInSocial(input: {
      headers: Headers;
      body: {
        provider: string;
        callbackURL: string;
        errorCallbackURL: string;
        disableRedirect: boolean;
      };
    }): Promise<{ url?: string | null }>;
    enableTwoFactor(input: {
      headers: Headers;
      body: {
        password: string;
        method: "totp";
        issuer: string;
      };
    }): Promise<{
      method?: string;
      totpURI?: string;
    }>;
    generateTOTP(input: {
      body: {
        secret: string;
      };
    }): Promise<{ code: string }>;
  };
  ready(): Promise<void>;
};
