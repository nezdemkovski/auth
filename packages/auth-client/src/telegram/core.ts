import { AuthClientError, AuthClientErrorCode } from "../errors";
import type { AuthSessionService } from "../session/core";
import type { AuthTransport } from "../transport/core";

export class AuthTelegramService {
  constructor(
    private readonly transport: AuthTransport,
    private readonly session: AuthSessionService
  ) {}

  async signIn(initData: string) {
    if (!initData.trim()) {
      throw new AuthClientError(AuthClientErrorCode.InvalidConfiguration, "Telegram initData is required");
    }
    const response = await this.transport.request(this.transport.realmPath("/auth/telegram/miniapp/signin"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData })
    });
    if (!response.ok) {
      throw new AuthClientError(
        AuthClientErrorCode.RequestFailed,
        `Telegram sign-in failed with status ${response.status}`,
        response.status
      );
    }
    const token = response.headers.get("set-auth-token");
    if (!token) {
      throw new AuthClientError(AuthClientErrorCode.InvalidResponse, "Auth service returned no session token");
    }
    await this.session.setSessionToken(token);
    await this.session.getAccessToken(true);
  }
}
