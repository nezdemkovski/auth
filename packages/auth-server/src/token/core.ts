import { parseRealmIdentity, type RealmIdentity } from "@nezdemkovski/auth-contracts";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { RealmAuthConfig } from "../config/validator";
import { RealmAuthError, RealmAuthErrorCode } from "../errors";

export class RealmTokenVerifier {
  private readonly keyResolver: JWTVerifyGetKey;

  constructor(private readonly config: RealmAuthConfig) {
    this.keyResolver = config.keyResolver ?? createRemoteJWKSet(config.jwksUrl);
  }

  async verify(token: string): Promise<RealmIdentity> {
    let payload: unknown;
    try {
      const verified = await jwtVerify(token, this.keyResolver, {
        issuer: this.config.issuer,
        audience: this.config.realm
      });
      payload = verified.payload;
    } catch {
      throw new RealmAuthError(RealmAuthErrorCode.InvalidToken, "Invalid or expired realm access token");
    }

    const identity = parseRealmIdentity(payload);
    if (!identity) {
      throw new RealmAuthError(RealmAuthErrorCode.InvalidClaims, "Realm access token has invalid claims");
    }
    if (identity.realm !== this.config.realm) {
      throw new RealmAuthError(RealmAuthErrorCode.WrongRealm, "Realm access token belongs to another realm");
    }
    return identity;
  }
}
