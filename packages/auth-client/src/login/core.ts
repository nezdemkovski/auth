import {
  LoginMode,
  PkceChallengeMethod,
  parseLoginCodeExchangeResponse
} from "@nezdemkovski/auth-contracts";
import type { AuthClientConfig } from "../config/validator";
import type { AuthCrypto } from "../crypto/core";
import { base64UrlEncode } from "../crypto/base64";
import { AuthClientError, AuthClientErrorCode } from "../errors";
import type { AuthSessionService } from "../session/core";
import type { AuthStorage } from "../storage/core";
import type { AuthTransport } from "../transport/core";

export type CreateLoginUrlOptions = {
  redirectUri: string;
  mode?: LoginMode;
};

export type CompleteLoginOptions = {
  callbackUrl: string;
  redirectUri: string;
};

export class AuthLoginService {
  private readonly verifierKey: string;
  private readonly stateKey: string;

  constructor(
    config: AuthClientConfig,
    private readonly transport: AuthTransport,
    private readonly session: AuthSessionService,
    private readonly storage: AuthStorage,
    private readonly crypto: AuthCrypto
  ) {
    const prefix = `@nezdemkovski/auth:${config.realm}:login`;
    this.verifierKey = `${prefix}:verifier`;
    this.stateKey = `${prefix}:state`;
  }

  async createUrl(options: CreateLoginUrlOptions) {
    validateRedirectUri(options.redirectUri);
    const verifier = base64UrlEncode(this.crypto.randomBytes(32));
    const state = base64UrlEncode(this.crypto.randomBytes(32));
    const challenge = base64UrlEncode(await this.crypto.sha256(verifier));
    await Promise.all([
      this.storage.set(this.verifierKey, verifier),
      this.storage.set(this.stateKey, state)
    ]);

    const url = this.transport.loginUrl();
    url.searchParams.set("redirect_uri", options.redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", PkceChallengeMethod.S256);
    url.searchParams.set("mode", options.mode ?? LoginMode.Login);
    return url.toString();
  }

  async complete(options: CompleteLoginOptions) {
    validateRedirectUri(options.redirectUri);
    const callback = new URL(options.callbackUrl);
    const code = callback.searchParams.get("code");
    const state = callback.searchParams.get("state");
    if (!code && !state) {
      return false;
    }

    const [verifier, expectedState] = await Promise.all([
      this.storage.get(this.verifierKey),
      this.storage.get(this.stateKey)
    ]);
    if (!code || !state || !verifier || !expectedState || state !== expectedState) {
      throw new AuthClientError(AuthClientErrorCode.InvalidCallback, "Login callback state is invalid");
    }

    const body = await this.transport.requestJson(this.transport.realmPath("/login/token"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        redirect_uri: options.redirectUri,
        code_verifier: verifier
      })
    });
    const exchange = parseLoginCodeExchangeResponse(body);
    if (!exchange) {
      throw new AuthClientError(AuthClientErrorCode.InvalidResponse, "Auth service returned no session");
    }

    await this.session.setSessionToken(sessionTokenFromCookie(exchange.sessionCookie));
    await this.session.getAccessToken(true);
    await Promise.all([
      this.storage.delete(this.verifierKey),
      this.storage.delete(this.stateKey)
    ]);
    return true;
  }
}

const validateRedirectUri = (redirectUri: string) => {
  try {
    new URL(redirectUri);
  } catch {
    throw new AuthClientError(AuthClientErrorCode.InvalidConfiguration, "redirectUri must be an absolute URL");
  }
};

const sessionTokenFromCookie = (sessionCookie: string) => {
  const cookiePair = sessionCookie.split(";", 1)[0];
  const separator = cookiePair?.indexOf("=") ?? -1;
  if (!cookiePair || separator <= 0) {
    throw new AuthClientError(AuthClientErrorCode.InvalidResponse, "Auth service returned an invalid session cookie");
  }
  try {
    return decodeURIComponent(cookiePair.slice(separator + 1));
  } catch {
    throw new AuthClientError(AuthClientErrorCode.InvalidResponse, "Auth service returned an invalid session cookie");
  }
};
