import type { BillingSettingsPatch } from "./store";

type BillingSettingsBody = Partial<Record<keyof BillingSettingsPatch, unknown>>;
type CreatePolarProductBody = {
  slug?: unknown;
  name?: unknown;
  description?: unknown;
  type?: unknown;
  priceAmount?: unknown;
  priceCurrency?: unknown;
  recurringInterval?: unknown;
};

export type CreatePolarProductInput = {
  slug: string;
  name: string;
  description: string;
  type: "subscription" | "one_time" | "credit_pack" | "lifetime";
  priceAmount: number;
  priceCurrency: string;
  recurringInterval: "month" | "year";
};

export function parseBillingSettingsPatch(
  body: BillingSettingsBody
): BillingSettingsPatch | null {
  if (
    typeof body.provider !== "string" ||
    typeof body.enabled !== "boolean" ||
    typeof body.environment !== "string" ||
    !Array.isArray(body.products)
  ) {
    return null;
  }

  const products = body.products
    .filter(isRecord)
    .map((product) => {
      if (
        typeof product.slug !== "string" ||
        typeof product.name !== "string" ||
        typeof product.description !== "string" ||
        typeof product.productId !== "string" ||
        typeof product.type !== "string" ||
        typeof product.active !== "boolean" ||
        !Array.isArray(product.entitlements)
      ) {
        return null;
      }

      const entitlements = product.entitlements
        .filter(isRecord)
        .map((entitlement) => {
          if (
            typeof entitlement.key !== "string" ||
            typeof entitlement.grantType !== "string" ||
            typeof entitlement.resetPeriod !== "string" ||
            typeof entitlement.priority !== "number"
          ) {
            return null;
          }

          return {
            key: entitlement.key.trim(),
            grantType:
              entitlement.grantType as BillingSettingsPatch["products"][number]["entitlements"][number]["grantType"],
            amount:
              typeof entitlement.amount === "number" && Number.isFinite(entitlement.amount)
                ? entitlement.amount
                : null,
            resetPeriod:
              entitlement.resetPeriod as BillingSettingsPatch["products"][number]["entitlements"][number]["resetPeriod"],
            priority: entitlement.priority
          };
        })
        .filter((entitlement) => entitlement !== null);

      return {
        slug: product.slug.trim(),
        name: product.name.trim(),
        description: product.description.trim(),
        productId: product.productId.trim(),
        type: product.type as BillingSettingsPatch["products"][number]["type"],
        active: product.active,
        entitlements
      };
    })
    .filter((product) => product !== null);

  const patch: BillingSettingsPatch = {
    provider: body.provider as BillingSettingsPatch["provider"],
    enabled: body.enabled,
    environment: body.environment as BillingSettingsPatch["environment"],
    organizationId: typeof body.organizationId === "string" ? body.organizationId.trim() : "",
    products
  };

  if (typeof body.accessToken === "string" && body.accessToken.trim()) {
    patch.accessToken = body.accessToken.trim();
  }
  if (typeof body.webhookSecret === "string" && body.webhookSecret.trim()) {
    patch.webhookSecret = body.webhookSecret.trim();
  }

  return patch;
}

export function parseCreatePolarProduct(
  body: CreatePolarProductBody
): CreatePolarProductInput | null {
  if (
    typeof body.slug !== "string" ||
    typeof body.name !== "string" ||
    typeof body.description !== "string" ||
    typeof body.type !== "string" ||
    typeof body.priceAmount !== "number" ||
    typeof body.priceCurrency !== "string" ||
    typeof body.recurringInterval !== "string"
  ) {
    return null;
  }

  const slug = body.slug.trim();
  const name = body.name.trim();
  const priceCurrency = body.priceCurrency.trim().toLowerCase();
  const type =
    body.type === "subscription" ||
    body.type === "one_time" ||
    body.type === "credit_pack" ||
    body.type === "lifetime"
      ? body.type
      : null;
  const recurringInterval =
    body.recurringInterval === "year" || body.recurringInterval === "month"
      ? body.recurringInterval
      : null;

  if (
    !type ||
    !recurringInterval ||
    !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) ||
    name.length === 0 ||
    priceCurrency.length !== 3 ||
    !Number.isFinite(body.priceAmount) ||
    body.priceAmount < 50
  ) {
    return null;
  }

  return {
    slug,
    name,
    description: body.description.trim(),
    type,
    priceAmount: Math.round(body.priceAmount),
    priceCurrency,
    recurringInterval
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
