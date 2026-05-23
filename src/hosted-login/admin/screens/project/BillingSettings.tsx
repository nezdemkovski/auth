import type React from "react";
import { useEffect, useMemo, useState } from "react";

import type {
  BillingEntitlement,
  BillingProductMapping,
  BillingSettings,
  BillingSettingsPatch,
  CreatePolarProductInput,
  PolarProductSummary
} from "../../types";
import { FormAlert, SettingsInput, SettingsTextarea } from "../../components/primitives";

const productTypes = [
  "subscription",
  "one_time",
  "credit_pack",
  "lifetime",
  "metered"
] as const;
const grantTypes = [
  "boolean",
  "recurring_quota",
  "one_time_credits",
  "lifetime",
  "metered"
] as const;
const resetPeriods = ["never", "monthly", "yearly"] as const;

const productTypeLabels: Record<BillingProductMapping["type"], string> = {
  subscription: "Subscription",
  one_time: "One-time",
  credit_pack: "Credit pack",
  lifetime: "Lifetime",
  metered: "Metered"
};

const grantLabels: Record<BillingEntitlement["grantType"], string> = {
  boolean: "Feature access",
  recurring_quota: "Recurring quota",
  one_time_credits: "One-time credits",
  lifetime: "Lifetime access",
  metered: "Metered usage"
};

const resetLabels: Record<BillingEntitlement["resetPeriod"], string> = {
  never: "Never",
  monthly: "Monthly",
  yearly: "Yearly"
};

export function BillingSettings({
  settings,
  disabled,
  pending,
  verifyPending,
  error,
  polarProducts,
  polarProductsLoading,
  polarProductsError,
  polarProductCreatePending,
  polarProductCreateError,
  onSave,
  onVerify,
  onRefreshPolarProducts,
  onCreatePolarProduct
}: {
  settings: BillingSettings;
  disabled: boolean;
  pending: boolean;
  verifyPending: boolean;
  error: string | null;
  polarProducts: PolarProductSummary[];
  polarProductsLoading: boolean;
  polarProductsError: string | null;
  polarProductCreatePending: boolean;
  polarProductCreateError: string | null;
  onSave: (patch: BillingSettingsPatch) => void;
  onVerify: (input: {
    accessToken?: string;
    environment?: BillingSettings["environment"];
  }) => void;
  onRefreshPolarProducts: () => void;
  onCreatePolarProduct: (
    input: CreatePolarProductInput
  ) => Promise<BillingProductMapping>;
}) {
  const [form, setForm] = useState(() => settingsToForm(settings));
  const [createForm, setCreateForm] = useState(() => defaultCreateForm());
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setForm(settingsToForm(settings));
    setLocalError(null);
  }, [settings]);

  const activeProducts = useMemo(
    () => form.products.filter((product) => product.active).length,
    [form.products]
  );

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateProduct(index: number, patch: Partial<BillingProductMapping>) {
    update(
      "products",
      form.products.map((product, currentIndex) =>
        currentIndex === index ? { ...product, ...patch } : product
      )
    );
  }

  function updateEntitlement(
    productIndex: number,
    entitlementIndex: number,
    patch: Partial<BillingEntitlement>
  ) {
    updateProduct(productIndex, {
      entitlements: form.products[productIndex].entitlements.map(
        (entitlement, currentIndex) =>
          currentIndex === entitlementIndex ? { ...entitlement, ...patch } : entitlement
      )
    });
  }

  function addProduct() {
    update("products", [
      ...form.products,
      {
        slug: "starter",
        name: "Starter",
        description: "",
        productId: "",
        type: "subscription",
        active: true,
        entitlements: [
          {
            key: "ai_requests",
            grantType: "recurring_quota",
            amount: 100,
            resetPeriod: "monthly",
            priority: 100
          }
        ]
      }
    ]);
  }

  function addImportedProduct(product: PolarProductSummary) {
    if (form.products.some((mapping) => mapping.productId === product.id)) {
      setLocalError("This Polar product is already mapped.");
      return;
    }

    setLocalError(null);
    update("products", [
      ...form.products,
      {
        slug: slugFromName(product.name),
        name: product.name,
        description: product.description,
        productId: product.id,
        type: product.isRecurring ? "subscription" : "one_time",
        active: true,
        entitlements: product.isRecurring
          ? [
              {
                key: "ai_requests",
                grantType: "recurring_quota",
                amount: 100,
                resetPeriod: "monthly",
                priority: 100
              }
            ]
          : [
              {
                key: "access",
                grantType: "boolean",
                amount: null,
                resetPeriod: "never",
                priority: 100
              }
            ]
      }
    ]);
  }

  async function createInPolar() {
    if (!createForm.name.trim()) {
      setLocalError("Product name is required.");
      return;
    }
    if (createForm.priceAmount < 50) {
      setLocalError("Price amount must be at least 50 minor currency units.");
      return;
    }

    setLocalError(null);
    const product = await onCreatePolarProduct({
      ...createForm,
      slug: createForm.slug.trim() || slugFromName(createForm.name),
      name: createForm.name.trim(),
      description: createForm.description.trim(),
      priceCurrency: createForm.priceCurrency.trim().toLowerCase(),
      priceAmount: Math.round(createForm.priceAmount)
    });
    update("products", [...form.products, product]);
    setCreateForm(defaultCreateForm());
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      form.enabled &&
      form.provider === "polar" &&
      !form.accessTokenConfigured &&
      !form.accessToken.trim()
    ) {
      setLocalError("Add a Polar access token before enabling billing.");
      return;
    }

    setLocalError(null);
    onSave({
      provider: form.enabled ? "polar" : "none",
      enabled: form.enabled,
      environment: form.environment,
      products: form.products.map((product) => ({
        ...product,
        slug: product.slug.trim(),
        name: product.name.trim(),
        description: product.description.trim(),
        productId: product.productId.trim(),
        entitlements: product.entitlements.map((entitlement) => ({
          ...entitlement,
          key: entitlement.key.trim()
        }))
      })),
      ...(form.accessToken.trim() ? { accessToken: form.accessToken.trim() } : {}),
      ...(form.webhookSecret.trim() ? { webhookSecret: form.webhookSecret.trim() } : {})
    });
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
            Billing
          </h2>
          <p className="mt-1 max-w-[42rem] text-[12.5px] leading-5 text-muted">
            Connect Polar once, then map products to the benefits your app grants.
          </p>
        </div>
        <button
          type="button"
          data-press
          disabled={
            disabled ||
            verifyPending ||
            !form.enabled ||
            (!settings.accessTokenConfigured && !form.accessToken.trim())
          }
          onClick={() =>
            onVerify({
              ...(form.accessToken.trim() ? { accessToken: form.accessToken.trim() } : {}),
              environment: form.environment
            })
          }
          className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface-muted px-3 text-[12.5px] font-medium text-ink-soft outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {verifyPending ? "Checking…" : "Check connection"}
        </button>
      </div>

      {localError || error ? <FormAlert>{localError ?? error}</FormAlert> : null}
      {polarProductsError || polarProductCreateError ? (
        <FormAlert>{polarProductsError ?? polarProductCreateError}</FormAlert>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <BillingStatusCard
          label="Provider"
          value={form.enabled ? "Polar" : "Disabled"}
          tone={form.enabled ? "success" : "muted"}
        />
        <BillingStatusCard
          label="Environment"
          value={form.environment}
          tone={form.environment === "production" ? "warning" : "muted"}
        />
        <BillingStatusCard
          label="Products"
          value={`${activeProducts}/${form.products.length} active`}
          tone={activeProducts > 0 ? "success" : "muted"}
        />
      </div>

      <SettingsPanel
        title="Connection"
        description="Enable billing and store the credentials used by the server."
        defaultOpen
      >
        <div className="space-y-4">
          <ToggleRow
            label="Enable Polar billing"
            description="Checkout, customer portal, usage meters, and webhooks are only exposed when billing is enabled."
            checked={form.enabled}
            disabled={disabled || pending}
            onChange={(checked) => update("enabled", checked)}
          />

          {form.enabled ? (
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                label="Environment"
                value={form.environment}
                disabled={disabled || pending}
                onChange={(value) =>
                  update("environment", value as BillingSettings["environment"])
                }
                options={[
                  ["sandbox", "Sandbox"],
                  ["production", "Production"]
                ]}
              />
              <SettingsInput
                id="polar-access-token"
                label="Access token"
                value={form.accessToken}
                type="password"
                disabled={disabled || pending}
                placeholder={
                  settings.accessTokenConfigured ? "Stored encrypted" : "Polar access token"
                }
                onChange={(value) => update("accessToken", value)}
              />
              <SettingsInput
                id="polar-webhook-secret"
                label="Webhook secret"
                value={form.webhookSecret}
                type="password"
                disabled={disabled || pending}
                placeholder={
                  settings.webhookSecretConfigured ? "Stored encrypted" : "Optional"
                }
                onChange={(value) => update("webhookSecret", value)}
              />
              <SettingsTextarea
                id="polar-webhook-url"
                label="Webhook URL"
                value={settings.webhookUrl}
                disabled
                rows={2}
                onChange={() => {}}
              />
            </div>
          ) : null}
        </div>
      </SettingsPanel>

      {form.enabled ? (
        <SettingsPanel
          title="Polar catalog"
          description="Import existing products or create a private product without leaving the dashboard."
        >
          <div className="mb-4 flex justify-end">
            <button
              type="button"
              data-press
              disabled={
                disabled ||
                polarProductsLoading ||
                !settings.enabled ||
                !settings.accessTokenConfigured
              }
              onClick={onRefreshPolarProducts}
              className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-surface px-2.5 text-[12px] font-medium text-ink-soft outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {polarProductsLoading ? "Loading…" : "Load from Polar"}
            </button>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
            <div className="space-y-2">
              {polarProducts.length > 0 ? (
                polarProducts.map((product) => {
                  const mapped = form.products.some(
                    (mapping) => mapping.productId === product.id
                  );
                  return (
                    <div
                      key={product.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-semibold text-ink">
                            {product.name}
                          </span>
                          <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                            {product.isRecurring ? "subscription" : "one-time"}
                          </span>
                        </div>
                        <div className="mt-1 break-all font-mono text-[11.5px] text-muted">
                          {product.id}
                        </div>
                      </div>
                      <button
                        type="button"
                        data-press
                        disabled={disabled || pending || mapped}
                        onClick={() => addImportedProduct(product)}
                        className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-surface-muted px-2.5 text-[12px] font-medium text-ink-soft outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        {mapped ? "Mapped" : "Import"}
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-lg border border-border bg-surface px-3 py-3 text-[12.5px] leading-5 text-muted">
                  Load products from Polar when credentials are saved. You can also
                  create a product here and map it automatically.
                </div>
              )}
            </div>

            <details className="group rounded-lg border border-border bg-surface">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-[13px] font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                Create product
                <span className="text-[12px] font-medium text-muted group-open:hidden">
                  Show
                </span>
                <span className="hidden text-[12px] font-medium text-muted group-open:inline">
                  Hide
                </span>
              </summary>
              <div className="border-t border-border p-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <SettingsInput
                    id="polar-create-name"
                    label="Name"
                    value={createForm.name}
                    disabled={disabled || polarProductCreatePending}
                    onChange={(value) =>
                      setCreateForm((current) => ({
                        ...current,
                        name: value,
                        slug: current.slug || slugFromName(value)
                      }))
                    }
                  />
                  <SettingsInput
                    id="polar-create-slug"
                    label="Slug"
                    value={createForm.slug}
                    disabled={disabled || polarProductCreatePending}
                    onChange={(value) =>
                      setCreateForm((current) => ({ ...current, slug: value }))
                    }
                  />
                  <SelectField
                    label="Type"
                    value={createForm.type}
                    disabled={disabled || polarProductCreatePending}
                    onChange={(value) =>
                      setCreateForm((current) => ({
                        ...current,
                        type: value as CreatePolarProductInput["type"]
                      }))
                    }
                    options={[
                      ["subscription", "Subscription"],
                      ["one_time", "One-time"],
                      ["credit_pack", "Credit pack"],
                      ["lifetime", "Lifetime"]
                    ]}
                  />
                  <SelectField
                    label="Billing interval"
                    value={createForm.recurringInterval}
                    disabled={
                      disabled ||
                      polarProductCreatePending ||
                      createForm.type !== "subscription"
                    }
                    onChange={(value) =>
                      setCreateForm((current) => ({
                        ...current,
                        recurringInterval:
                          value as CreatePolarProductInput["recurringInterval"]
                      }))
                    }
                    options={[
                      ["month", "Monthly"],
                      ["year", "Yearly"]
                    ]}
                  />
                  <SettingsInput
                    id="polar-create-price"
                    label="Price in minor units"
                    value={String(createForm.priceAmount)}
                    disabled={disabled || polarProductCreatePending}
                    onChange={(value) =>
                      setCreateForm((current) => ({
                        ...current,
                        priceAmount: Number(value)
                      }))
                    }
                  />
                  <SettingsInput
                    id="polar-create-currency"
                    label="Currency"
                    value={createForm.priceCurrency}
                    disabled={disabled || polarProductCreatePending}
                    onChange={(value) =>
                      setCreateForm((current) => ({
                        ...current,
                        priceCurrency: value
                      }))
                    }
                  />
                </div>
                <div className="mt-3">
                  <SettingsTextarea
                    id="polar-create-description"
                    label="Description"
                    value={createForm.description}
                    disabled={disabled || polarProductCreatePending}
                    rows={2}
                    onChange={(value) =>
                      setCreateForm((current) => ({ ...current, description: value }))
                    }
                  />
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    data-press
                    disabled={
                      disabled ||
                      polarProductCreatePending ||
                      !settings.enabled ||
                      !settings.accessTokenConfigured
                    }
                    onClick={() => void createInPolar()}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface-muted px-3 text-[12.5px] font-medium text-ink-soft outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {polarProductCreatePending ? "Creating…" : "Create and map"}
                  </button>
                </div>
              </div>
            </details>
          </div>
        </SettingsPanel>
      ) : null}

      <SettingsPanel
        title="Mapped products"
        description="These are the products your application can request by slug."
      >
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            data-press
            disabled={disabled || pending}
            onClick={addProduct}
            className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-surface px-2.5 text-[12px] font-medium text-ink-soft outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-55"
          >
            Add manually
          </button>
        </div>
        {form.products.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface px-3 py-3 text-[12.5px] leading-5 text-muted">
            No mapped products yet. Import from Polar or add one manually.
          </div>
        ) : (
          <div className="grid gap-3">
            {form.products.map((product, productIndex) => (
              <ProductEditor
                key={`${product.slug}-${productIndex}`}
                product={product}
                productIndex={productIndex}
                disabled={disabled || pending}
                onUpdateProduct={updateProduct}
                onUpdateEntitlement={updateEntitlement}
                onRemove={() =>
                  update(
                    "products",
                    form.products.filter(
                      (_item, currentIndex) => currentIndex !== productIndex
                    )
                  )
                }
              />
            ))}
          </div>
        )}
      </SettingsPanel>

      <div className="flex justify-end">
        <button
          type="submit"
          data-press
          disabled={disabled || pending}
          className="inline-flex h-9 items-center justify-center rounded-lg bg-accent px-4 text-[13px] font-medium text-accent-ink outline-none transition-colors hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-55"
          style={{ boxShadow: "var(--shadow-button)" }}
        >
          {pending ? "Saving…" : "Save billing"}
        </button>
      </div>
    </form>
  );
}

function ProductEditor({
  product,
  productIndex,
  disabled,
  onUpdateProduct,
  onUpdateEntitlement,
  onRemove
}: {
  product: BillingProductMapping;
  productIndex: number;
  disabled: boolean;
  onUpdateProduct: (index: number, patch: Partial<BillingProductMapping>) => void;
  onUpdateEntitlement: (
    productIndex: number,
    entitlementIndex: number,
    patch: Partial<BillingEntitlement>
  ) => void;
  onRemove: () => void;
}) {
  return (
    <details className="group rounded-lg border border-border bg-surface" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[13.5px] font-semibold text-ink">
              {product.name || product.slug || "Untitled product"}
            </span>
            <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
              {productTypeLabels[product.type]}
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                product.active
                  ? "border-success-border bg-success-bg text-success"
                  : "border-border bg-surface-muted text-muted"
              }`}
            >
              {product.active ? "active" : "paused"}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-[11.5px] text-muted">
            <code className="font-mono">{product.slug || "no-slug"}</code>
            <span>·</span>
            <span>{product.entitlements.length} benefits</span>
          </div>
        </div>
        <span className="text-[12px] font-medium text-muted group-open:hidden">
          Edit
        </span>
        <span className="hidden text-[12px] font-medium text-muted group-open:inline">
          Done
        </span>
      </summary>

      <div className="space-y-4 border-t border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TogglePill
            checked={product.active}
            disabled={disabled}
            onChange={(checked) => onUpdateProduct(productIndex, { active: checked })}
          />
          <button
            type="button"
            data-press
            disabled={disabled}
            onClick={onRemove}
            className="text-[12.5px] font-medium text-muted underline-offset-[3px] hover:text-ink hover:underline disabled:cursor-not-allowed disabled:opacity-55"
          >
            Remove product
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <SettingsInput
            id={`billing-product-slug-${productIndex}`}
            label="Slug used by apps"
            value={product.slug}
            disabled={disabled}
            onChange={(value) => onUpdateProduct(productIndex, { slug: value })}
          />
          <SettingsInput
            id={`billing-product-name-${productIndex}`}
            label="Display name"
            value={product.name}
            disabled={disabled}
            onChange={(value) => onUpdateProduct(productIndex, { name: value })}
          />
          <SettingsInput
            id={`billing-product-id-${productIndex}`}
            label="Polar product ID"
            value={product.productId}
            disabled={disabled}
            onChange={(value) => onUpdateProduct(productIndex, { productId: value })}
          />
          <SelectField
            label="Product type"
            value={product.type}
            disabled={disabled}
            onChange={(value) =>
              onUpdateProduct(productIndex, {
                type: value as BillingProductMapping["type"]
              })
            }
            options={productTypes.map((type) => [type, productTypeLabels[type]])}
          />
        </div>

        <SettingsTextarea
          id={`billing-product-description-${productIndex}`}
          label="Checkout description"
          value={product.description}
          disabled={disabled}
          rows={2}
          onChange={(value) => onUpdateProduct(productIndex, { description: value })}
        />

        <div className="space-y-3 rounded-lg border border-border bg-surface-muted p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12.5px] font-semibold text-ink-soft">
              Benefits granted after purchase
            </span>
            <button
              type="button"
              data-press
              disabled={disabled}
              onClick={() =>
                onUpdateProduct(productIndex, {
                  entitlements: [
                    ...product.entitlements,
                    {
                      key: "feature_access",
                      grantType: "boolean",
                      amount: null,
                      resetPeriod: "never",
                      priority: 100
                    }
                  ]
                })
              }
              className="text-[12.5px] font-medium text-muted underline-offset-[3px] hover:text-ink hover:underline disabled:cursor-not-allowed disabled:opacity-55"
            >
              Add benefit
            </button>
          </div>

          {product.entitlements.map((entitlement, entitlementIndex) => (
            <div
              key={`${entitlement.key}-${entitlementIndex}`}
              className="grid gap-3 rounded-lg border border-border bg-surface p-3 md:grid-cols-[1fr_1fr_1fr_0.7fr_auto]"
            >
              <SettingsInput
                id={`billing-entitlement-key-${productIndex}-${entitlementIndex}`}
                label="Key"
                value={entitlement.key}
                disabled={disabled}
                onChange={(value) =>
                  onUpdateEntitlement(productIndex, entitlementIndex, { key: value })
                }
              />
              <SelectField
                label="Grant"
                value={entitlement.grantType}
                disabled={disabled}
                onChange={(value) =>
                  onUpdateEntitlement(productIndex, entitlementIndex, {
                    grantType: value as BillingEntitlement["grantType"]
                  })
                }
                options={grantTypes.map((type) => [type, grantLabels[type]])}
              />
              <SelectField
                label="Reset"
                value={entitlement.resetPeriod}
                disabled={disabled}
                onChange={(value) =>
                  onUpdateEntitlement(productIndex, entitlementIndex, {
                    resetPeriod: value as BillingEntitlement["resetPeriod"]
                  })
                }
                options={resetPeriods.map((period) => [period, resetLabels[period]])}
              />
              <SettingsInput
                id={`billing-entitlement-amount-${productIndex}-${entitlementIndex}`}
                label="Amount"
                value={entitlement.amount === null ? "" : String(entitlement.amount)}
                disabled={disabled}
                onChange={(value) =>
                  onUpdateEntitlement(productIndex, entitlementIndex, {
                    amount: value.trim() ? Number(value) : null
                  })
                }
              />
              <button
                type="button"
                data-press
                disabled={disabled}
                onClick={() =>
                  onUpdateProduct(productIndex, {
                    entitlements: product.entitlements.filter(
                      (_item, currentIndex) => currentIndex !== entitlementIndex
                    )
                  })
                }
                className="self-end text-[12.5px] font-medium text-muted underline-offset-[3px] hover:text-ink hover:underline disabled:cursor-not-allowed disabled:opacity-55"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

function BillingStatusCard({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "muted";
}) {
  const toneClass =
    tone === "success"
      ? "border-success-border bg-success-bg text-success"
      : tone === "warning"
        ? "border-warning-border bg-warning-bg text-warning"
        : "border-border bg-surface-muted text-muted";

  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
        {label}
      </div>
      <div className={`mt-2 inline-flex rounded-full border px-2 py-1 text-[12px] font-semibold ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

function SettingsPanel({
  title,
  description,
  defaultOpen = false,
  children
}: {
  title: string;
  description: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-lg border border-border bg-surface-muted"
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
        <span>
          <span className="block text-[13.5px] font-semibold text-ink">{title}</span>
          <span className="mt-1 block max-w-[38rem] text-[12px] leading-5 text-muted">
            {description}
          </span>
        </span>
        <span className="shrink-0">
          <span className="rounded-full border border-border bg-surface px-2 py-1 text-[11px] font-medium text-muted group-open:hidden">
            Open
          </span>
          <span className="hidden rounded-full border border-border bg-surface px-2 py-1 text-[11px] font-medium text-muted group-open:inline">
            Close
          </span>
        </span>
      </summary>
      <div className="border-t border-border p-4">{children}</div>
    </details>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface px-3 py-3">
      <span>
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        <span className="mt-0.5 block text-[12px] leading-5 text-muted">
          {description}
        </span>
      </span>
      <TogglePill checked={checked} disabled={disabled} onChange={onChange} />
    </label>
  );
}

function TogglePill({
  checked,
  disabled,
  onChange
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-[12.5px] font-medium text-ink-soft">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="sr-only"
      />
      <span
        className={`relative h-6 w-10 rounded-full border border-border transition-colors ${
          checked ? "bg-accent" : "bg-surface-muted"
        } ${disabled ? "cursor-not-allowed opacity-55" : ""}`}
      >
        <span
          className={`absolute left-1 top-1 h-4 w-4 rounded-full transition-transform ${
            checked ? "translate-x-4 bg-accent-ink" : "bg-muted-soft"
          }`}
        />
      </span>
      {checked ? "On" : "Off"}
    </label>
  );
}

function SelectField({
  label,
  value,
  disabled,
  options,
  onChange
}: {
  label: string;
  value: string;
  disabled: boolean;
  options: Array<readonly [string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[12.5px] font-medium text-ink-soft">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-[14px] text-ink outline-none transition-[border-color,box-shadow,background-color] focus:border-border-strong focus:shadow-[0_0_0_3px_var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {options.map(([optionValue, label]) => (
          <option key={optionValue} value={optionValue}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

function settingsToForm(settings: BillingSettings) {
  return {
    provider: settings.provider,
    enabled: settings.enabled && settings.provider === "polar",
    environment: settings.environment,
    organizationId: "",
    accessToken: "",
    webhookSecret: "",
    accessTokenConfigured: settings.accessTokenConfigured,
    products: settings.products.map((product) => ({
      ...product,
      entitlements: product.entitlements.map((entitlement) => ({ ...entitlement }))
    }))
  };
}

function defaultCreateForm(): CreatePolarProductInput {
  return {
    slug: "",
    name: "",
    description: "",
    type: "credit_pack",
    priceAmount: 1000,
    priceCurrency: "eur",
    recurringInterval: "month"
  };
}

function slugFromName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || "product";
}
