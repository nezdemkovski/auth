import { parseBillingUsageSummaryResponse, type BillingUsageSummary } from "@nezdemkovski/auth-contracts";
import { AuthClientError, AuthClientErrorCode } from "../errors";
import type { AuthSessionService } from "../session/core";
import type { AuthTransport } from "../transport/core";

export class AuthBillingService {
  constructor(
    private readonly transport: AuthTransport,
    private readonly session: AuthSessionService
  ) {}

  async getUsage(key: string): Promise<BillingUsageSummary> {
    if (!key.trim()) {
      throw new AuthClientError(AuthClientErrorCode.InvalidConfiguration, "Billing benefit key is required");
    }
    const sessionToken = await this.session.requireSessionToken();
    const path = this.transport.realmPath(`/billing/usage/summary?key=${encodeURIComponent(key)}`);
    const body = await this.transport.requestJson(path, {
      headers: { Authorization: `Bearer ${sessionToken}` }
    });
    const summary = parseBillingUsageSummaryResponse(body);
    if (!summary) {
      throw new AuthClientError(AuthClientErrorCode.InvalidResponse, "Auth service returned invalid billing usage");
    }
    return summary;
  }
}
