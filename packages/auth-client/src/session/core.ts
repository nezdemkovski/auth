import { parseAccessTokenResponse } from "@nezdemkovski/auth-contracts";
import type { AuthClientConfig } from "../config/validator";
import { AuthClientError, AuthClientErrorCode } from "../errors";
import type { AuthStorage } from "../storage/core";
import type { AuthTransport } from "../transport/core";
import { accessTokenExpiresAt } from "./token";

export enum AuthSessionStatus {
  Loading = "loading",
  Anonymous = "anonymous",
  Authenticated = "authenticated"
}

export type AuthSessionState = {
  status: AuthSessionStatus;
};

export type AuthSessionListener = (state: AuthSessionState) => void;

export class AuthSessionService {
  private sessionToken: string | null = null;
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;
  private initializePromise: Promise<void> | null = null;
  private refreshPromise: Promise<string> | null = null;
  private state: AuthSessionState = { status: AuthSessionStatus.Loading };
  private readonly listeners = new Set<AuthSessionListener>();
  private readonly sessionKey: string;

  constructor(
    private readonly config: AuthClientConfig,
    private readonly transport: AuthTransport,
    private readonly storage: AuthStorage
  ) {
    this.sessionKey = `@nezdemkovski/auth:${config.realm}:session`;
  }

  initialize() {
    if (!this.initializePromise) {
      this.initializePromise = this.loadSession().catch((error) => {
        this.initializePromise = null;
        throw error;
      });
    }
    return this.initializePromise;
  }

  getState() {
    return this.state;
  }

  subscribe(listener: AuthSessionListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async getAccessToken(forceRefresh = false) {
    await this.initialize();
    const nowSeconds = Math.floor(this.config.now() / 1000);
    if (
      !forceRefresh &&
      this.accessToken &&
      this.accessTokenExpiresAt > nowSeconds + this.config.accessTokenExpirySkewSeconds
    ) {
      return this.accessToken;
    }
    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshAccessToken().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  async requireSessionToken() {
    await this.initialize();
    if (!this.sessionToken) {
      throw new AuthClientError(AuthClientErrorCode.NoSession, "No auth session is available");
    }
    return this.sessionToken;
  }

  async readSessionToken() {
    if (!this.sessionToken) {
      this.sessionToken = await this.storage.get(this.sessionKey);
    }
    return this.sessionToken;
  }

  async setSessionToken(token: string) {
    this.sessionToken = token;
    this.invalidateAccessToken();
    await this.storage.set(this.sessionKey, token);
    if (!this.initializePromise) {
      this.initializePromise = Promise.resolve();
    }
  }

  invalidateAccessToken() {
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
  }

  async clear() {
    this.sessionToken = null;
    this.invalidateAccessToken();
    await this.storage.delete(this.sessionKey);
    this.updateState(AuthSessionStatus.Anonymous);
  }

  private async loadSession() {
    this.sessionToken = await this.storage.get(this.sessionKey);
    if (!this.sessionToken) {
      this.updateState(AuthSessionStatus.Anonymous);
      return;
    }
    try {
      await this.refreshAccessToken();
    } catch (error) {
      if (error instanceof AuthClientError && (error.status === 401 || error.status === 403)) {
        await this.clear();
        return;
      }
      throw error;
    }
  }

  private async refreshAccessToken() {
    if (!this.sessionToken) {
      throw new AuthClientError(AuthClientErrorCode.NoSession, "No auth session is available");
    }
    const body = await this.transport.requestJson(this.transport.realmPath("/auth/token"), {
      headers: { Authorization: `Bearer ${this.sessionToken}` }
    });
    const response = parseAccessTokenResponse(body);
    if (!response) {
      throw new AuthClientError(AuthClientErrorCode.InvalidResponse, "Auth service returned no access token");
    }
    this.accessToken = response.token;
    this.accessTokenExpiresAt = accessTokenExpiresAt(response.token);
    this.updateState(AuthSessionStatus.Authenticated);
    return response.token;
  }

  private updateState(status: AuthSessionStatus) {
    this.state = { status };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
