import * as oauth from "oauth4webapi";

import {
  DEFAULT_AUTH_SCOPES,
  normalizeAuthConfiguration
} from "../shared/config.js";
import type {
  AuthClient,
  AuthClientConfiguration,
  AuthSession,
  CreateAuthClient
} from "./index.js";
import {
  authSessionFromUserInfo,
  browserRedirectUri,
  isRecord,
  parseStoredJson,
  safeReturnTo
} from "./shared.js";

export type {
  AuthClient,
  AuthClientConfiguration,
  AuthSession,
  AuthUser,
  SignInOptions
} from "./index.js";

type BrowserTransaction = {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  returnTo: string;
};

type BrowserTokens = {
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken?: string;
  idToken?: string;
};

const CLOCK_SKEW_MS = 30_000;

const transactionFromStorage = (value: string | null): BrowserTransaction | null => {
  const parsed = parseStoredJson(value);
  if (
    !isRecord(parsed) ||
    typeof parsed.state !== "string" ||
    typeof parsed.codeVerifier !== "string" ||
    typeof parsed.redirectUri !== "string" ||
    typeof parsed.returnTo !== "string"
  ) {
    return null;
  }
  return {
    state: parsed.state,
    codeVerifier: parsed.codeVerifier,
    redirectUri: parsed.redirectUri,
    returnTo: parsed.returnTo
  };
};

export const createAuthClient: CreateAuthClient = (
  configuration: AuthClientConfiguration
) => {
  const normalized = normalizeAuthConfiguration(configuration);
  const client: oauth.Client = { client_id: normalized.clientId };
  const storagePrefix = `nezdemkovski.auth:${normalized.issuer}:${normalized.clientId}`;
  const refreshTokenKey = `${storagePrefix}:refresh-token`;
  const transactionKey = `${storagePrefix}:transaction`;
  const channelName = `${storagePrefix}:events`;
  let authorizationServer: oauth.AuthorizationServer | null = null;
  let tokens: BrowserTokens | null = null;
  let session: AuthSession | null = null;
  let refreshInFlight: Promise<string | null> | null = null;
  const listeners = new Set<(value: AuthSession | null) => void>();
  const channel = typeof BroadcastChannel === "undefined"
    ? null
    : new BroadcastChannel(channelName);

  const notify = () => {
    for (const listener of listeners) {
      listener(session);
    }
  };

  const clearLocalSession = () => {
    tokens = null;
    session = null;
    localStorage.removeItem(refreshTokenKey);
    notify();
  };

  channel?.addEventListener("message", (event) => {
    if (event.data === "signed-out") {
      tokens = null;
      session = null;
      notify();
    }
  });

  const discover = async () => {
    if (authorizationServer) {
      return authorizationServer;
    }
    const issuer = new URL(normalized.issuer);
    const response = await oauth.discoveryRequest(issuer);
    authorizationServer = await oauth.processDiscoveryResponse(issuer, response);
    return authorizationServer;
  };

  const defaultRedirectUri = () => browserRedirectUri(
    configuration.redirectUri,
    new URL(window.location.href)
  );

  const userInfoFor = async (
    authorizationServer: oauth.AuthorizationServer,
    accessToken: string,
    subject: string | typeof oauth.skipSubjectCheck
  ) => {
    const response = await oauth.userInfoRequest(
      authorizationServer,
      client,
      accessToken
    );
    const userInfo = await oauth.processUserInfoResponse(
      authorizationServer,
      client,
      subject,
      response
    );
    session = authSessionFromUserInfo(userInfo);
    notify();
    return session;
  };

  const saveTokens = (response: oauth.TokenEndpointResponse) => {
    const previousRefreshToken = tokens?.refreshToken ??
      localStorage.getItem(refreshTokenKey) ?? undefined;
    tokens = {
      accessToken: response.access_token,
      accessTokenExpiresAt: Date.now() + (response.expires_in ?? 300) * 1_000,
      ...(response.refresh_token || previousRefreshToken
        ? { refreshToken: response.refresh_token ?? previousRefreshToken }
        : {}),
      ...(response.id_token ? { idToken: response.id_token } : {})
    };
    if (tokens.refreshToken) {
      localStorage.setItem(refreshTokenKey, tokens.refreshToken);
    }
  };

  const refresh = async () => {
    const refreshToken = tokens?.refreshToken ?? localStorage.getItem(refreshTokenKey);
    if (!refreshToken) {
      return null;
    }
    const authorizationServer = await discover();
    try {
      const response = await oauth.refreshTokenGrantRequest(
        authorizationServer,
        client,
        oauth.None(),
        refreshToken,
        {
          additionalParameters: {
            resource: normalized.applicationResource
          }
        }
      );
      const tokenResponse = await oauth.processRefreshTokenResponse(
        authorizationServer,
        client,
        response
      );
      saveTokens(tokenResponse);
      return tokenResponse.access_token;
    } catch (error) {
      clearLocalSession();
      throw error;
    }
  };

  const getFreshAccessToken = async () => {
    if (tokens && tokens.accessTokenExpiresAt > Date.now() + CLOCK_SKEW_MS) {
      return tokens.accessToken;
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
        if (!accessToken) {
          return null;
        }
        return await userInfoFor(
          await discover(),
          accessToken,
          oauth.skipSubjectCheck
        );
      } catch {
        return null;
      }
    },
    signIn: async (options) => {
      const authorizationServer = await discover();
      if (!authorizationServer.authorization_endpoint) {
        throw new Error("The authorization server has no authorization endpoint");
      }
      const codeVerifier = oauth.generateRandomCodeVerifier();
      const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier);
      const state = oauth.generateRandomState();
      const redirectUri = defaultRedirectUri();
      const authorizationUrl = new URL(authorizationServer.authorization_endpoint);
      authorizationUrl.searchParams.set("client_id", normalized.clientId);
      authorizationUrl.searchParams.set("redirect_uri", redirectUri);
      authorizationUrl.searchParams.set("response_type", "code");
      authorizationUrl.searchParams.set("scope", DEFAULT_AUTH_SCOPES.join(" "));
      authorizationUrl.searchParams.set("resource", normalized.applicationResource);
      authorizationUrl.searchParams.set("code_challenge", codeChallenge);
      authorizationUrl.searchParams.set("code_challenge_method", "S256");
      authorizationUrl.searchParams.set("state", state);
      const transaction: BrowserTransaction = {
        state,
        codeVerifier,
        redirectUri,
        returnTo: safeReturnTo(options?.returnTo, new URL(window.location.href))
      };
      sessionStorage.setItem(transactionKey, JSON.stringify(transaction));
      window.location.assign(authorizationUrl);
    },
    handleCallback: async () => {
      const transaction = transactionFromStorage(
        sessionStorage.getItem(transactionKey)
      );
      if (!transaction) {
        return null;
      }
      sessionStorage.removeItem(transactionKey);
      const authorizationServer = await discover();
      const callbackParameters = oauth.validateAuthResponse(
        authorizationServer,
        client,
        new URL(window.location.href),
        transaction.state
      );
      const response = await oauth.authorizationCodeGrantRequest(
        authorizationServer,
        client,
        oauth.None(),
        callbackParameters,
        transaction.redirectUri,
        transaction.codeVerifier,
        {
          additionalParameters: {
            resource: normalized.applicationResource
          }
        }
      );
      const tokenResponse = await oauth.processAuthorizationCodeResponse(
        authorizationServer,
        client,
        response,
        { requireIdToken: true }
      );
      const idToken = oauth.getValidatedIdTokenClaims(tokenResponse);
      if (!idToken) {
        throw new Error("The authorization server did not return an ID token");
      }
      saveTokens(tokenResponse);
      await userInfoFor(authorizationServer, tokenResponse.access_token, idToken.sub);
      window.history.replaceState({}, "", transaction.returnTo);
      return session;
    },
    getSession: () => session,
    getAccessToken: getFreshAccessToken,
    invalidateAccessToken: () => {
      if (tokens) {
        tokens.accessTokenExpiresAt = 0;
      }
    },
    signOut: async () => {
      const tokenToRevoke = tokens?.refreshToken ??
        localStorage.getItem(refreshTokenKey) ?? tokens?.accessToken;
      if (tokenToRevoke) {
        try {
          const authorizationServer = await discover();
          const response = await oauth.revocationRequest(
            authorizationServer,
            client,
            oauth.None(),
            tokenToRevoke
          );
          await oauth.processRevocationResponse(response);
        } catch {
          // Local sign-out must remain available while the auth server is offline.
        }
      }
      clearLocalSession();
      channel?.postMessage("signed-out");
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };

  return api;
};
