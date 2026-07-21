import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";

import {
  DEFAULT_AUTH_SCOPES,
  normalizeAuthConfiguration,
  realmSlugFromIssuer
} from "../shared/config.js";
import type {
  AuthClient,
  AuthClientConfiguration,
  AuthSession as AppAuthSession,
  CreateAuthClient
} from "./index.js";
import { authSessionFromUserInfo } from "./shared.js";

export type {
  AuthClient,
  AuthClientConfiguration,
  AuthSession,
  AuthUser,
  SignInOptions
} from "./index.js";

const CLOCK_SKEW_MS = 30_000;

export const createAuthClient: CreateAuthClient = (
  configuration: AuthClientConfiguration
) => {
  const normalized = normalizeAuthConfiguration(configuration);
  const refreshTokenKey = `nezdemkovski.auth.${normalized.clientId}.refresh-token`;
  const redirectUri = configuration.redirectUri ?? AuthSession.makeRedirectUri({
    scheme: realmSlugFromIssuer(normalized.issuer),
    path: "auth/callback"
  });
  let discovery: AuthSession.DiscoveryDocument | null = null;
  let tokenResponse: AuthSession.TokenResponse | null = null;
  let session: AppAuthSession | null = null;
  let refreshInFlight: Promise<string | null> | null = null;
  const listeners = new Set<(value: AppAuthSession | null) => void>();

  const notify = () => {
    for (const listener of listeners) {
      listener(session);
    }
  };

  const getDiscovery = async () => {
    if (!discovery) {
      discovery = await AuthSession.fetchDiscoveryAsync(normalized.issuer);
    }
    return discovery;
  };

  const saveTokenResponse = async (next: AuthSession.TokenResponse) => {
    const previousRefreshToken = tokenResponse?.refreshToken ??
      await SecureStore.getItemAsync(refreshTokenKey) ?? undefined;
    tokenResponse = next;
    const refreshToken = next.refreshToken ?? previousRefreshToken;
    if (refreshToken) {
      await SecureStore.setItemAsync(refreshTokenKey, refreshToken);
    }
  };

  const loadSession = async (accessToken: string) => {
    const userInfo = await AuthSession.fetchUserInfoAsync(
      { accessToken },
      await getDiscovery()
    );
    session = authSessionFromUserInfo(userInfo);
    notify();
    return session;
  };

  const clearLocalSession = async () => {
    tokenResponse = null;
    session = null;
    await SecureStore.deleteItemAsync(refreshTokenKey);
    notify();
  };

  const refresh = async () => {
    const refreshToken = tokenResponse?.refreshToken ??
      await SecureStore.getItemAsync(refreshTokenKey);
    if (!refreshToken) {
      return null;
    }
    try {
      const next = await AuthSession.refreshAsync(
        {
          clientId: normalized.clientId,
          refreshToken,
          scopes: DEFAULT_AUTH_SCOPES,
          extraParams: { resource: normalized.applicationResource }
        },
        await getDiscovery()
      );
      await saveTokenResponse(next);
      return next.accessToken;
    } catch (error) {
      await clearLocalSession();
      throw error;
    }
  };

  const getFreshAccessToken = async () => {
    if (
      tokenResponse &&
      tokenResponse.issuedAt + (tokenResponse.expiresIn ?? 300) >
        Date.now() / 1_000 + CLOCK_SKEW_MS / 1_000
    ) {
      return tokenResponse.accessToken;
    }
    if (!refreshInFlight) {
      refreshInFlight = refresh().finally(() => {
        refreshInFlight = null;
      });
    }
    return refreshInFlight;
  };

  const api: AuthClient = {
    initialize: async () => {
      try {
        const accessToken = await getFreshAccessToken();
        return accessToken ? await loadSession(accessToken) : null;
      } catch {
        return null;
      }
    },
    signIn: async () => {
      const request = new AuthSession.AuthRequest({
        clientId: normalized.clientId,
        redirectUri,
        responseType: AuthSession.ResponseType.Code,
        scopes: DEFAULT_AUTH_SCOPES,
        usePKCE: true,
        extraParams: { resource: normalized.applicationResource }
      });
      const result = await request.promptAsync(await getDiscovery());
      if (result.type !== "success") {
        return;
      }
      if (!request.codeVerifier) {
        throw new Error("PKCE code verifier is missing");
      }
      const next = await AuthSession.exchangeCodeAsync(
        {
          clientId: normalized.clientId,
          code: result.params.code,
          redirectUri,
          extraParams: {
            code_verifier: request.codeVerifier,
            resource: normalized.applicationResource
          }
        },
        await getDiscovery()
      );
      await saveTokenResponse(next);
      await loadSession(next.accessToken);
    },
    handleCallback: async () => session,
    getSession: () => session,
    getAccessToken: getFreshAccessToken,
    invalidateAccessToken: () => {
      if (tokenResponse) {
        tokenResponse.issuedAt = 0;
      }
    },
    signOut: async () => {
      const token = tokenResponse?.refreshToken ??
        await SecureStore.getItemAsync(refreshTokenKey) ??
        tokenResponse?.accessToken;
      if (token) {
        try {
          await AuthSession.revokeAsync(
            { clientId: normalized.clientId, token },
            await getDiscovery()
          );
        } catch {
          // Local sign-out must remain available while the auth server is offline.
        }
      }
      await clearLocalSession();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };

  return api;
};
