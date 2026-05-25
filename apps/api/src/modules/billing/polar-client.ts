import { Polar } from "@polar-sh/sdk";
import type { Product } from "@polar-sh/sdk/models/components/product";

import {
  BillingProductType,
  BillingProvider,
  type AuthProject,
  type ProjectBillingSettings
} from "../../config/projects";
import { isRecord } from "../../runtime/type-guards";
import type { CreatePolarProductInput } from "./validator";

export const createPolarClientFromProject = (project: AuthProject) => {
  return createPolarClient(project.billing);
};

export const createPolarClient = (billing: ProjectBillingSettings) => {
  if (
    billing.provider !== BillingProvider.Polar ||
    !billing.enabled ||
    !billing.accessToken
  ) {
    return null;
  }

  return new Polar({
    accessToken: billing.accessToken,
    server: billing.environment
  });
};

export const verifyPolarAccess = async (input: {
  accessToken: string;
  environment: ProjectBillingSettings["environment"];
}) => {
  const client = new Polar({
    accessToken: input.accessToken,
    server: input.environment
  });

  await client.products.list({ limit: 1 });
};

export const listPolarProducts = async (client: Polar) => {
  const page = await client.products.list({
    isArchived: false,
    limit: 50
  });

  return page.result.items;
};

export const createPolarProduct = async (client: Polar, input: CreatePolarProductInput) => {
  return client.products.create({
    name: input.name,
    description: input.description || null,
    visibility: "private",
    prices: [
      {
        amountType: "fixed",
        priceAmount: input.priceAmount,
        priceCurrency: input.priceCurrency
      }
    ],
    ...(input.type === BillingProductType.Subscription
      ? {
          recurringInterval: input.recurringInterval,
          recurringIntervalCount: 1
        }
      : {
          recurringInterval: null,
          recurringIntervalCount: null
        })
  });
};

export const polarErrorMessage = (error: unknown, fallback: string) => {
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
};

const parsePolarErrorBody = (body: string) => {
  if (!body) {
    return null;
  }

  try {
    const data: unknown = JSON.parse(body);
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
    if (typeof data.error_description === "string") {
      return data.error_description;
    }
    if (typeof data.error === "string") {
      return data.error;
    }
    return JSON.stringify(data).slice(0, 300);
  } catch {
    return body.slice(0, 300);
  }
};
