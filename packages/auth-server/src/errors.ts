export enum RealmAuthErrorCode {
  InvalidConfiguration = "invalid_configuration",
  MissingBearerToken = "missing_bearer_token",
  InvalidToken = "invalid_token",
  InvalidClaims = "invalid_claims",
  WrongRealm = "wrong_realm"
}

export class RealmAuthError extends Error {
  constructor(
    readonly code: RealmAuthErrorCode,
    message: string
  ) {
    super(message);
    this.name = "RealmAuthError";
  }
}
