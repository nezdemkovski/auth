import type { AuthClientConfig } from "../config/validator";
import { AuthClientError, AuthClientErrorCode } from "../errors";

export class AuthTransport {
  constructor(private readonly config: AuthClientConfig) {}

  realmPath(path: string) {
    return `/api/${encodeURIComponent(this.config.realm)}${path}`;
  }

  loginUrl() {
    return new URL(`/login/${encodeURIComponent(this.config.realm)}`, this.config.baseUrl);
  }

  async request(path: string, init?: RequestInit) {
    try {
      return await this.config.fetch(`${this.config.baseUrl}${path}`, init);
    } catch (error) {
      throw new AuthClientError(
        AuthClientErrorCode.RequestFailed,
        error instanceof Error ? error.message : "Auth request failed"
      );
    }
  }

  async requestJson(path: string, init?: RequestInit): Promise<unknown> {
    const response = await this.request(path, init);
    if (!response.ok) {
      throw new AuthClientError(
        AuthClientErrorCode.RequestFailed,
        `Auth request failed with status ${response.status}`,
        response.status
      );
    }
    try {
      const body: unknown = await response.json();
      return body;
    } catch {
      throw new AuthClientError(AuthClientErrorCode.InvalidResponse, "Auth service returned invalid JSON");
    }
  }
}
