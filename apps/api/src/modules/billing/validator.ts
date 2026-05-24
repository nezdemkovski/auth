import type {
  BillingEntitlement,
  BillingProductMapping,
  ProjectBillingSettings
} from "../../config/projects";

export type BillingSettingsPatch = {
  provider: ProjectBillingSettings["provider"];
  enabled: boolean;
  environment: ProjectBillingSettings["environment"];
  organizationId?: string;
  accessToken?: string;
  webhookSecret?: string;
  products: BillingProductMapping[];
};

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

      const productType = parseBillingProductType(product.type);
      if (!productType) {
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

          const grantType = parseBillingGrantType(entitlement.grantType);
          const resetPeriod = parseBillingResetPeriod(entitlement.resetPeriod);
          if (!grantType || !resetPeriod) {
            return null;
          }

          return {
            key: entitlement.key.trim(),
            grantType,
            amount:
              typeof entitlement.amount === "number" && Number.isFinite(entitlement.amount)
                ? entitlement.amount
                : null,
            resetPeriod,
            priority: entitlement.priority
          };
        });

      if (entitlements.some((entitlement) => entitlement === null)) {
        return null;
      }
      const validEntitlements = entitlements.filter(
        (entitlement): entitlement is BillingEntitlement => entitlement !== null
      );

      return {
        slug: product.slug.trim(),
        name: product.name.trim(),
        description: product.description.trim(),
        productId: product.productId.trim(),
        type: productType,
        active: product.active,
        entitlements: validEntitlements
      };
    });

  if (products.some((product) => product === null)) {
    return null;
  }
  const validProducts = products.filter(
    (product): product is BillingProductMapping => product !== null
  );

  const provider = parseBillingProvider(body.provider);
  const environment = parseBillingEnvironment(body.environment);
  if (!provider || !environment) {
    return null;
  }

  const patch: BillingSettingsPatch = {
    provider,
    enabled: body.enabled,
    environment,
    organizationId: typeof body.organizationId === "string" ? body.organizationId.trim() : "",
    products: validProducts
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

export function validateBillingSettingsPatch(patch: BillingSettingsPatch): void {
  if (patch.provider !== "none" && patch.provider !== "polar") {
    throw new Error("Invalid billing provider");
  }
  if (patch.environment !== "sandbox" && patch.environment !== "production") {
    throw new Error("Invalid billing environment");
  }
  if (!Array.isArray(patch.products)) {
    throw new Error("Products must be an array");
  }
  if (patch.organizationId !== undefined && typeof patch.organizationId !== "string") {
    throw new Error("Invalid organization ID");
  }

  const slugs = new Set<string>();
  for (const product of patch.products) {
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(product.slug)) {
      throw new Error(`Invalid product slug: ${product.slug}`);
    }
    if (slugs.has(product.slug)) {
      throw new Error(`Duplicate product slug: ${product.slug}`);
    }
    slugs.add(product.slug);
    if (!product.name.trim()) {
      throw new Error(`Product name is required: ${product.slug}`);
    }
    if (product.active && !product.productId.trim()) {
      throw new Error(`Polar product ID is required: ${product.slug}`);
    }
    for (const entitlement of product.entitlements) {
      validateEntitlement(entitlement);
    }
  }
}

function validateEntitlement(entitlement: BillingEntitlement): void {
  if (!/^[a-z][a-z0-9_]*$/.test(entitlement.key)) {
    throw new Error(`Invalid entitlement key: ${entitlement.key}`);
  }
  if (
    !["boolean", "recurring_quota", "one_time_credits", "lifetime", "metered"].includes(
      entitlement.grantType
    )
  ) {
    throw new Error(`Invalid entitlement grant type: ${entitlement.key}`);
  }
  if (!["never", "monthly", "yearly"].includes(entitlement.resetPeriod)) {
    throw new Error(`Invalid entitlement reset period: ${entitlement.key}`);
  }
  if (
    entitlement.amount !== null &&
    (!Number.isFinite(entitlement.amount) || entitlement.amount < 0)
  ) {
    throw new Error(`Invalid entitlement amount: ${entitlement.key}`);
  }
}

function parseBillingProvider(
  value: string
): BillingSettingsPatch["provider"] | null {
  return value === "none" || value === "polar" ? value : null;
}

function parseBillingEnvironment(
  value: string
): BillingSettingsPatch["environment"] | null {
  return value === "sandbox" || value === "production" ? value : null;
}

function parseBillingProductType(
  value: string
): BillingProductMapping["type"] | null {
  return value === "subscription" ||
    value === "one_time" ||
    value === "credit_pack" ||
    value === "lifetime" ||
    value === "metered"
    ? value
    : null;
}

function parseBillingGrantType(
  value: string
): BillingEntitlement["grantType"] | null {
  return value === "boolean" ||
    value === "recurring_quota" ||
    value === "one_time_credits" ||
    value === "lifetime" ||
    value === "metered"
    ? value
    : null;
}

function parseBillingResetPeriod(
  value: string
): BillingEntitlement["resetPeriod"] | null {
  return value === "monthly" || value === "yearly" || value === "never"
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
