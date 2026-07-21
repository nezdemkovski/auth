import { genericOAuth } from "better-auth/plugins";
import {
  verifyProviderIdToken,
  type OAuthIdTokenConfig
} from "better-auth/oauth2";
import {
  createRemoteJWKSet,
  decodeJwt,
  type JWTVerifyGetKey
} from "jose";

export const TELEGRAM_OIDC_ISSUER = "https://oauth.telegram.org";
export const TELEGRAM_OIDC_DISCOVERY_URL =
  `${TELEGRAM_OIDC_ISSUER}/.well-known/openid-configuration`;
export const TELEGRAM_OIDC_JWKS_URL =
  `${TELEGRAM_OIDC_ISSUER}/.well-known/jwks.json`;

const telegramJwks = createRemoteJWKSet(new URL(TELEGRAM_OIDC_JWKS_URL));

export type TelegramOidcSettings = {
  clientId: string;
  clientSecret: string;
};

export const createTelegramOidcPlugin = (settings: TelegramOidcSettings) => {
  const idTokenVerification = createTelegramIdTokenVerification(settings.clientId);

  return genericOAuth({
    config: [{
      providerId: "telegram",
      name: "Telegram",
      discoveryUrl: TELEGRAM_OIDC_DISCOVERY_URL,
      clientId: settings.clientId,
      clientSecret: settings.clientSecret,
      authentication: "basic",
      scopes: ["openid", "profile"],
      pkce: true,
      getUserInfo: async (tokens) => {
        return telegramOidcUser(tokens.idToken, idTokenVerification);
      }
    }]
  });
};

export const createTelegramIdTokenVerification = (
  clientId: string,
  jwks: JWTVerifyGetKey = telegramJwks
): OAuthIdTokenConfig => {
  return {
    jwks,
    issuer: TELEGRAM_OIDC_ISSUER,
    audience: clientId,
    algorithms: ["RS256", "ES256"]
  };
};

export const telegramOidcUser = async (
  idToken: string | undefined,
  verification: OAuthIdTokenConfig
) => {
  if (!idToken) {
    return null;
  }

  try {
    const verified = await verifyProviderIdToken(
      { idToken: verification },
      idToken
    );
    if (!verified) {
      return null;
    }

    const claims = decodeJwt(idToken);
    const id = telegramClaimId(claims.sub);
    if (!id) {
      return null;
    }

    return {
      id,
      email: `telegram-${id}@telegram.invalid`,
      emailVerified: false,
      name: telegramStringClaim(claims.name) ?? `Telegram user ${id}`,
      image: telegramStringClaim(claims.picture) ?? undefined,
      telegramId: id
    };
  } catch {
    return null;
  }
};

const telegramClaimId = (value: unknown) => {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return String(value);
  }

  return telegramStringClaim(value);
};

const telegramStringClaim = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  return value.trim() || null;
};
