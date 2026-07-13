export enum AuthClientErrorCode {
  InvalidConfiguration = "invalid_configuration",
  CryptoUnavailable = "crypto_unavailable",
  NoSession = "no_session",
  InvalidCallback = "invalid_callback",
  InvalidResponse = "invalid_response",
  RequestFailed = "request_failed"
}

export class AuthClientError extends Error {
  constructor(
    readonly code: AuthClientErrorCode,
    message: string,
    readonly status: number | null = null
  ) {
    super(message);
    this.name = "AuthClientError";
  }
}
