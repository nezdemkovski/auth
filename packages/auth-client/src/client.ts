import type { AuthClientOptions } from "./config/validator";
import { parseAuthClientConfig } from "./config/validator";
import { createWebAuthCrypto } from "./crypto/core";
import { AuthClientError, AuthClientErrorCode } from "./errors";
import { AuthBillingService } from "./billing/core";
import { AuthLoginService, type CompleteLoginOptions, type CreateLoginUrlOptions } from "./login/core";
import { AuthProfileService, type UploadAvatarOptions } from "./profile/core";
import {
  AuthSessionService,
  type AuthSessionListener,
  type AuthSessionState
} from "./session/core";
import { createMemoryAuthStorage } from "./storage/memory";
import { AuthTelegramService } from "./telegram/core";
import { AuthTransport } from "./transport/core";
import type { BillingUsageSummary } from "@nezdemkovski/auth-contracts";

export type AuthClient = {
  session: {
    initialize(): Promise<void>;
    getState(): AuthSessionState;
    subscribe(listener: AuthSessionListener): () => void;
    getAccessToken(options?: { forceRefresh?: boolean }): Promise<string>;
  };
  login: {
    createUrl(options: CreateLoginUrlOptions): Promise<string>;
    complete(options: CompleteLoginOptions): Promise<boolean>;
  };
  telegram: {
    signIn(initData: string): Promise<void>;
  };
  billing: {
    getUsage(key: string): Promise<BillingUsageSummary>;
  };
  profile: {
    uploadAvatar(options: UploadAvatarOptions): Promise<string>;
    deleteAvatar(): Promise<void>;
  };
  fetch(input: string | URL, init?: RequestInit): Promise<Response>;
  signOut(): Promise<void>;
};

export const createAuthClient = (options: AuthClientOptions): AuthClient => {
  const config = parseAuthClientConfig(options);
  if (!config) {
    throw new AuthClientError(AuthClientErrorCode.InvalidConfiguration, "Invalid auth client configuration");
  }

  const storage = options.storage ?? createMemoryAuthStorage();
  const transport = new AuthTransport(config);
  const session = new AuthSessionService(config, transport, storage);
  const login = new AuthLoginService(
    config,
    transport,
    session,
    storage,
    options.crypto ?? createWebAuthCrypto()
  );
  const telegram = new AuthTelegramService(transport, session);
  const billing = new AuthBillingService(transport, session);
  const profile = new AuthProfileService(transport, session);

  const authenticatedFetch = async (input: string | URL, init?: RequestInit, retry = true): Promise<Response> => {
    const token = await session.getAccessToken(!retry);
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    const response = await config.fetch(input, { ...init, headers });
    if (response.status !== 401) {
      return response;
    }
    if (retry) {
      session.invalidateAccessToken();
      return authenticatedFetch(input, init, false);
    }
    await session.clear();
    return response;
  };

  return {
    session: {
      initialize: () => session.initialize(),
      getState: () => session.getState(),
      subscribe: (listener) => session.subscribe(listener),
      getAccessToken: (tokenOptions) => session.getAccessToken(tokenOptions?.forceRefresh === true)
    },
    login: {
      createUrl: (loginOptions) => login.createUrl(loginOptions),
      complete: (loginOptions) => login.complete(loginOptions)
    },
    telegram: {
      signIn: (initData) => telegram.signIn(initData)
    },
    billing: {
      getUsage: (key) => billing.getUsage(key)
    },
    profile: {
      uploadAvatar: (uploadOptions) => profile.uploadAvatar(uploadOptions),
      deleteAvatar: () => profile.deleteAvatar()
    },
    fetch: (input, init) => authenticatedFetch(input, init),
    signOut: async () => {
      const token = await session.readSessionToken();
      await session.clear();
      if (!token) {
        return;
      }
      await transport.request(transport.realmPath("/auth/sign-out"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => undefined);
    }
  };
};
