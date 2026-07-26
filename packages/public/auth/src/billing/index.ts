import {
  booleanField,
  isRecord,
  numberField,
  stringField
} from "../shared/validator.js";
import * as oauth from "oauth4webapi";

import { normalizeAuthConfiguration } from "../shared/config.js";
import {
  authorizedFetch,
  type AccessTokenSource
} from "../shared/authorized-fetch.js";

export type BillingUsageSummary = {
  key: string;
  used: number;
  limit: number;
  remaining: number;
  unlimited: boolean;
};

export type BillingUsageResult = {
  allowed: boolean;
  summary: BillingUsageSummary;
};

export type BillingUsageReservationResult = BillingUsageResult & {
  reservationId: string | null;
};

export type BillingUsageReleaseResult = {
  released: boolean;
  summary: BillingUsageSummary;
};

export type BillingUsageRequest = {
  subject: string;
  key: string;
  idempotencyKey: string;
  amount?: number;
};

export type BillingUsageReservationRequest = {
  subject: string;
  reservationId: string;
};

export type BillingService = {
  consumeUsage(input: BillingUsageRequest): Promise<BillingUsageResult>;
  reserveUsage(
    input: BillingUsageRequest
  ): Promise<BillingUsageReservationResult>;
  commitUsage(
    input: BillingUsageReservationRequest
  ): Promise<BillingUsageResult>;
  releaseUsage(
    input: BillingUsageReservationRequest
  ): Promise<BillingUsageReleaseResult>;
};

export type BillingServiceConfiguration = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
};

export type BillingClient = {
  getUsageSummary(key: string): Promise<BillingUsageSummary>;
  createCheckout(slug: string): Promise<string>;
  createPortal(): Promise<string>;
};

export type BillingClientConfiguration = {
  issuer: string;
  auth: AccessTokenSource;
  fetch?: typeof fetch;
};

export const parseBillingUsageSummary = (
  value: unknown
): BillingUsageSummary | null => {
  const key = stringField(value, "key");
  const used = numberField(value, "used");
  const limit = numberField(value, "limit");
  const remaining = numberField(value, "remaining");
  const unlimited = booleanField(value, "unlimited");
  if (
    !key ||
    used === null ||
    limit === null ||
    remaining === null ||
    unlimited === null
  ) {
    return null;
  }
  return { key, used, limit, remaining, unlimited };
};

export const parseBillingUsageSummaryResponse = (
  value: unknown
): BillingUsageSummary | null => {
  if (!isRecord(value)) {
    return null;
  }
  return parseBillingUsageSummary(value.summary);
};

export const parseBillingUsageResult = (
  value: unknown
): BillingUsageResult | null => {
  if (!isRecord(value) || typeof value.allowed !== "boolean") {
    return null;
  }
  const summary = parseBillingUsageSummary(value.summary);
  return summary ? { allowed: value.allowed, summary } : null;
};

export const parseBillingUsageReservationResult = (
  value: unknown
): BillingUsageReservationResult | null => {
  const result = parseBillingUsageResult(value);
  if (
    !result ||
    !isRecord(value) ||
    !(
      value.reservationId === null ||
      typeof value.reservationId === "string"
    )
  ) {
    return null;
  }
  return { ...result, reservationId: value.reservationId };
};

export const parseBillingUsageReleaseResult = (
  value: unknown
): BillingUsageReleaseResult | null => {
  if (!isRecord(value) || value.released !== true) {
    return null;
  }
  const summary = parseBillingUsageSummary(value.summary);
  return summary ? { released: true, summary } : null;
};

const responseUrl = (value: unknown) => {
  if (!isRecord(value)) {
    return null;
  }
  return stringField(value, "url");
};

export const createBillingClient = (
  configuration: BillingClientConfiguration
): BillingClient => {
  const issuer = configuration.issuer.trim().replace(/\/+$/, "");
  const fetcher = configuration.fetch ?? fetch;
  const request = (path: string, init?: RequestInit) =>
    authorizedFetch(configuration.auth, fetcher, `${issuer}${path}`, init);

  return {
    getUsageSummary: async (key) => {
      const response = await request(
        `/billing/usage/summary?key=${encodeURIComponent(key)}`
      );
      const body: unknown = await response.json().catch(() => null);
      const summary = parseBillingUsageSummaryResponse(body);
      if (!response.ok || !summary) {
        throw new Error(`Billing usage request failed with status ${response.status}`);
      }
      return summary;
    },
    createCheckout: async (slug) => {
      const response = await request("/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug })
      });
      const body: unknown = await response.json().catch(() => null);
      const url = responseUrl(body);
      if (!response.ok || !url) {
        throw new Error(`Billing checkout request failed with status ${response.status}`);
      }
      return url;
    },
    createPortal: async () => {
      const response = await request("/billing/portal", { method: "POST" });
      const body: unknown = await response.json().catch(() => null);
      const url = responseUrl(body);
      if (!response.ok || !url) {
        throw new Error(`Billing portal request failed with status ${response.status}`);
      }
      return url;
    }
  };
};

export const createBillingService = (
  configuration: BillingServiceConfiguration
): BillingService => {
  const normalized = normalizeAuthConfiguration(configuration);
  const client: oauth.Client = { client_id: normalized.clientId };
  const fetcher = configuration.fetch ?? fetch;
  let authorizationServer: oauth.AuthorizationServer | null = null;
  let accessToken: { value: string; expiresAt: number } | null = null;

  const discover = async () => {
    if (authorizationServer) {
      return authorizationServer;
    }
    const issuer = new URL(normalized.issuer);
    const response = await oauth.discoveryRequest(issuer, {
      [oauth.customFetch]: fetcher
    });
    authorizationServer = await oauth.processDiscoveryResponse(issuer, response);
    return authorizationServer;
  };

  const getAccessToken = async () => {
    if (accessToken && accessToken.expiresAt > Date.now() + 30_000) {
      return accessToken.value;
    }
    const server = await discover();
    const response = await oauth.clientCredentialsGrantRequest(
      server,
      client,
      oauth.ClientSecretBasic(configuration.clientSecret),
      {
        scope: "billing:usage:write",
        resource: `${normalized.issuer}/billing`
      },
      { [oauth.customFetch]: fetcher }
    );
    const token = await oauth.processClientCredentialsResponse(
      server,
      client,
      response
    );
    accessToken = {
      value: token.access_token,
      expiresAt: Date.now() + (token.expires_in ?? 300) * 1_000
    };
    return accessToken.value;
  };

  const mutateUsage = async <T>(
    operation: "consume" | "reserve" | "commit" | "release",
    input: BillingUsageRequest | BillingUsageReservationRequest,
    parse: (value: unknown) => T | null,
    retry = true
  ): Promise<T> => {
    const headers = new Headers({
      Authorization: `Bearer ${await getAccessToken()}`,
      "Content-Type": "application/json"
    });
    if ("idempotencyKey" in input) {
      headers.set("Idempotency-Key", input.idempotencyKey);
    }
    const response = await fetcher(`${normalized.issuer}/billing/usage/${operation}`, {
      method: "POST",
      headers,
      body: JSON.stringify(
        "reservationId" in input
          ? {
              subject: input.subject,
              reservationId: input.reservationId
            }
          : {
              subject: input.subject,
              key: input.key,
              amount: input.amount ?? 1
            }
      )
    });
    if (response.status === 401 && retry) {
      accessToken = null;
      return mutateUsage(operation, input, parse, false);
    }
    const body: unknown = await response.json().catch(() => null);
    const result = parse(body);
    if ((response.ok || response.status === 402) && result) {
      return result;
    }
    throw new Error(`Billing usage request failed with status ${response.status}`);
  };

  return {
    consumeUsage: (input) =>
      mutateUsage("consume", input, parseBillingUsageResult),
    reserveUsage: (input) =>
      mutateUsage("reserve", input, parseBillingUsageReservationResult),
    commitUsage: (input) =>
      mutateUsage("commit", input, parseBillingUsageResult),
    releaseUsage: (input) =>
      mutateUsage("release", input, parseBillingUsageReleaseResult)
  };
};
