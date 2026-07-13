import { parseRealmAuthConfig, type RealmAuthOptions } from "./config/validator";
import { RealmAuthError, RealmAuthErrorCode } from "./errors";
import { extractBearerToken } from "./request/bearer";
import { RealmTokenVerifier } from "./token/core";
import type { RealmIdentity } from "@nezdemkovski/auth-contracts";

export type RealmAuth = {
  verifyToken(token: string): Promise<RealmIdentity>;
  verifyHeaders(headers: Headers): Promise<RealmIdentity>;
  verifyRequest(request: Request): Promise<RealmIdentity>;
};

export const createRealmAuth = (options: RealmAuthOptions): RealmAuth => {
  const config = parseRealmAuthConfig(options);
  if (!config) {
    throw new RealmAuthError(RealmAuthErrorCode.InvalidConfiguration, "Invalid realm auth configuration");
  }
  const verifier = new RealmTokenVerifier(config);

  const verifyHeaders = async (headers: Headers) => {
    const token = extractBearerToken(headers.get("authorization"));
    if (!token) {
      throw new RealmAuthError(RealmAuthErrorCode.MissingBearerToken, "Bearer access token is required");
    }
    return await verifier.verify(token);
  };

  return {
    verifyToken: (token) => verifier.verify(token),
    verifyHeaders,
    verifyRequest: (request) => verifyHeaders(request.headers)
  };
};

export { RealmAuthError, RealmAuthErrorCode } from "./errors";
export { extractBearerToken } from "./request/bearer";
export type { RealmAuthOptions } from "./config/validator";
export type { RealmIdentity } from "@nezdemkovski/auth-contracts";
