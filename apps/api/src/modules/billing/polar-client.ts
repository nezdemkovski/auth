import { Polar } from "@polar-sh/sdk";
import type { Product } from "@polar-sh/sdk/models/components/product";
import type { PresentmentCurrency } from "@polar-sh/sdk/models/components/presentmentcurrency";

import type { AuthProject, ProjectBillingSettings } from "../../config/projects";
import type { CreatePolarProductInput } from "./validator";

export function createPolarClientFromProject(project: AuthProject): Polar | null {
  return createPolarClient(project.billing);
}

export function createPolarClient(billing: ProjectBillingSettings): Polar | null {
  if (billing.provider !== "polar" || !billing.enabled || !billing.accessToken) {
    return null;
  }

  return new Polar({
    accessToken: billing.accessToken,
    server: billing.environment
  });
}

export async function verifyPolarAccess(input: {
  accessToken: string;
  environment: ProjectBillingSettings["environment"];
}): Promise<void> {
  const client = new Polar({
    accessToken: input.accessToken,
    server: input.environment
  });

  await client.products.list({ limit: 1 });
}

export async function listPolarProducts(client: Polar): Promise<Product[]> {
  const page = await client.products.list({
    isArchived: false,
    limit: 50
  });

  return page.result.items;
}

export async function createPolarProduct(
  client: Polar,
  input: CreatePolarProductInput
): Promise<Product> {
  return client.products.create({
    name: input.name,
    description: input.description || null,
    visibility: "private",
    prices: [
      {
        amountType: "fixed",
        priceAmount: input.priceAmount,
        priceCurrency: input.priceCurrency as PresentmentCurrency
      }
    ],
    ...(input.type === "subscription"
      ? {
          recurringInterval: input.recurringInterval,
          recurringIntervalCount: 1
        }
      : {
          recurringInterval: null,
          recurringIntervalCount: null
        })
  });
}

export function polarErrorMessage(error: unknown, fallback: string): string {
  if (isRecord(error)) {
    const body = typeof error.body === "string" ? error.body : "";
    const statusCode = typeof error.statusCode === "number" ? error.statusCode : null;
    const parsed = parsePolarErrorBody(body);
    if (parsed) {
      return statusCode ? `Polar ${statusCode}: ${parsed}` : parsed;
    }
    if (error.message && typeof error.message === "string") {
      return statusCode ? `Polar ${statusCode}: ${error.message}` : error.message;
    }
  }

  return error instanceof Error ? error.message : fallback;
}

function parsePolarErrorBody(body: string): string | null {
  if (!body) {
    return null;
  }

  try {
    const data = JSON.parse(body) as unknown;
    if (!isRecord(data)) {
      return body.slice(0, 300);
    }
    if (typeof data.detail === "string") {
      return data.detail;
    }
    if (Array.isArray(data.detail)) {
      return data.detail
        .map((item) => {
          if (!isRecord(item)) {
            return null;
          }
          const location = Array.isArray(item.loc) ? item.loc.join(".") : "";
          const message = typeof item.msg === "string" ? item.msg : null;
          return message ? [location, message].filter(Boolean).join(": ") : null;
        })
        .filter((item): item is string => Boolean(item))
        .join("; ");
    }
    if (typeof data.message === "string") {
      return data.message;
    }
    return JSON.stringify(data).slice(0, 300);
  } catch {
    return body.slice(0, 300);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
