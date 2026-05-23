import type React from "react";
import { useEffect, useState } from "react";

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
    organizationId?: string;
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
      entitlements: form.products[productIndex].entitlements.map((entitlement, currentIndex) =>
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
      setLocalError("Price amount must be at least 50 cents.");
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

    if (form.enabled && form.provider === "polar" && !form.accessTokenConfigured && !form.accessToken.trim()) {
      setLocalError("Polar access token is required before enabling billing.");
      return;
    }

    setLocalError(null);
    onSave({
      provider: form.enabled ? "polar" : "none",
      enabled: form.enabled,
      environment: form.environment,
      organizationId: form.organizationId.trim(),
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
            Connect Polar to this realm, map Polar products, and define the
            entitlements your apps can consume.
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
              environment: form.environment,
              organizationId: form.organizationId.trim()
            })
          }
          className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface-muted px-3 text-[12.5px] font-medium text-ink-soft outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {verifyPending ? "Checking…" : "Check Polar"}
        </button>
      </div>

      {localError || error ? <FormAlert>{localError ?? error}</FormAlert> : null}
      {polarProductsError || polarProductCreateError ? (
        <FormAlert>{polarProductsError ?? polarProductCreateError}</FormAlert>
      ) : null}

      <label className="flex items-start gap-3 rounded-lg border border-border bg-surface-muted px-3 py-3">
        <input
          type="checkbox"
          checked={form.enabled}
          disabled={disabled || pending}
          onChange={(event) => update("enabled", event.currentTarget.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border bg-surface text-accent focus:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
        />
        <span>
          <span className="block text-[13px] font-medium text-ink">
            Enable Polar billing
          </span>
          <span className="mt-0.5 block text-[12px] leading-5 text-muted">
            Disabled realms do not expose checkout, customer portal, usage, or
            Polar webhook endpoints.
          </span>
        </span>
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-[12.5px] font-medium text-ink-soft">Environment</span>
          <select
            value={form.environment}
            disabled={disabled || pending}
            onChange={(event) =>
              update("environment", event.currentTarget.value as BillingSettings["environment"])
            }
            className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-[14px] text-ink outline-none transition-[border-color,box-shadow,background-color] focus:border-border-strong focus:shadow-[0_0_0_3px_var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="sandbox">Sandbox</option>
            <option value="production">Production</option>
          </select>
        </label>
        <SettingsInput
          id="polar-organization-id"
          label="Organization ID"
          value={form.organizationId}
          disabled={disabled || pending}
          placeholder="Optional"
          onChange={(value) => update("organizationId", value)}
        />
        <SettingsInput
          id="polar-access-token"
          label="Access token"
          value={form.accessToken}
          type="password"
          disabled={disabled || pending}
          placeholder={settings.accessTokenConfigured ? "Stored encrypted" : "Polar access token"}
          onChange={(value) => update("accessToken", value)}
        />
        <SettingsInput
          id="polar-webhook-secret"
          label="Webhook secret"
          value={form.webhookSecret}
          type="password"
          disabled={disabled || pending}
          placeholder={settings.webhookSecretConfigured ? "Stored encrypted" : "Optional"}
          onChange={(value) => update("webhookSecret", value)}
        />
      </div>

      <SettingsTextarea
        id="polar-webhook-url"
        label="Webhook URL"
        value={settings.webhookUrl}
        disabled
        rows={2}
        onChange={() => {}}
      />

      <section className="space-y-3 rounded-lg border border-border bg-surface-muted p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[13px] font-semibold tracking-[-0.005em] text-ink">
              Polar catalog
            </h3>
            <p className="mt-1 max-w-[38rem] text-[12px] leading-5 text-muted">
              Import existing Polar products or create a private product in Polar
              and map it to this realm.
            </p>
          </div>
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
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface px-3 text-[12.5px] font-medium text-ink-soft outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {polarProductsLoading ? "Loading…" : "Load from Polar"}
          </button>
        </div>

        {polarProducts.length > 0 ? (
          <div className="grid gap-2">
            {polarProducts.map((product) => {
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
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface-muted px-3 text-[12.5px] font-medium text-ink-soft outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {mapped ? "Mapped" : "Import"}
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
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
            <label className="grid gap-1.5">
              <span className="text-[12.5px] font-medium text-ink-soft">Type</span>
              <select
                value={createForm.type}
                disabled={disabled || polarProductCreatePending}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    type: event.currentTarget.value as CreatePolarProductInput["type"]
                  }))
                }
                className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-[14px] text-ink outline-none transition-[border-color,box-shadow,background-color] focus:border-border-strong focus:shadow-[0_0_0_3px_var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="subscription">Subscription</option>
                <option value="one_time">One-time</option>
                <option value="credit_pack">Credit pack</option>
                <option value="lifetime">Lifetime</option>
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-[12.5px] font-medium text-ink-soft">
                Billing interval
              </span>
              <select
                value={createForm.recurringInterval}
                disabled={
                  disabled ||
                  polarProductCreatePending ||
                  createForm.type !== "subscription"
                }
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    recurringInterval: event.currentTarget.value as CreatePolarProductInput["recurringInterval"]
                  }))
                }
                className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-[14px] text-ink outline-none transition-[border-color,box-shadow,background-color] focus:border-border-strong focus:shadow-[0_0_0_3px_var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="month">Monthly</option>
                <option value="year">Yearly</option>
              </select>
            </label>
            <SettingsInput
              id="polar-create-price"
              label="Price amount, cents"
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
                setCreateForm((current) => ({ ...current, priceCurrency: value }))
              }
            />
          </div>
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
          <div className="flex justify-end">
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
              {polarProductCreatePending ? "Creating…" : "Create in Polar"}
            </button>
          </div>
        </div>
      </section>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[13px] font-semibold tracking-[-0.005em] text-ink">
            Products and entitlements
          </h3>
          <button
            type="button"
            data-press
            disabled={disabled || pending}
            onClick={addProduct}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface-muted px-3 text-[12.5px] font-medium text-ink-soft outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-55"
          >
            Add product
          </button>
        </div>

        {form.products.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface-muted px-3 py-3 text-[12.5px] leading-5 text-muted">
            Add products after creating them in Polar. The product ID maps checkout
            requests to a Polar product; entitlements stay in this auth service.
          </div>
        ) : null}

        {form.products.map((product, productIndex) => (
          <div key={`${product.slug}-${productIndex}`} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-soft">
                <input
                  type="checkbox"
                  checked={product.active}
                  disabled={disabled || pending}
                  onChange={(event) =>
                    updateProduct(productIndex, { active: event.currentTarget.checked })
                  }
                  className="h-4 w-4 rounded border-border bg-surface text-accent focus:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
                />
                Active
              </label>
              <button
                type="button"
                data-press
                disabled={disabled || pending}
                onClick={() =>
                  update(
                    "products",
                    form.products.filter((_item, currentIndex) => currentIndex !== productIndex)
                  )
                }
                className="text-[12.5px] font-medium text-muted underline-offset-[3px] hover:text-ink hover:underline disabled:cursor-not-allowed disabled:opacity-55"
              >
                Remove
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <SettingsInput
                id={`billing-product-slug-${productIndex}`}
                label="Slug"
                value={product.slug}
                disabled={disabled || pending}
                onChange={(value) => updateProduct(productIndex, { slug: value })}
              />
              <SettingsInput
                id={`billing-product-name-${productIndex}`}
                label="Name"
                value={product.name}
                disabled={disabled || pending}
                onChange={(value) => updateProduct(productIndex, { name: value })}
              />
              <SettingsInput
                id={`billing-product-id-${productIndex}`}
                label="Polar product ID"
                value={product.productId}
                disabled={disabled || pending}
                onChange={(value) => updateProduct(productIndex, { productId: value })}
              />
              <label className="grid gap-1.5">
                <span className="text-[12.5px] font-medium text-ink-soft">Type</span>
                <select
                  value={product.type}
                  disabled={disabled || pending}
                  onChange={(event) =>
                    updateProduct(productIndex, {
                      type: event.currentTarget.value as BillingProductMapping["type"]
                    })
                  }
                  className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-[14px] text-ink outline-none transition-[border-color,box-shadow,background-color] focus:border-border-strong focus:shadow-[0_0_0_3px_var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {productTypes.map((type) => (
                    <option key={type} value={type}>
                      {type.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <SettingsTextarea
              id={`billing-product-description-${productIndex}`}
              label="Description"
              value={product.description}
              disabled={disabled || pending}
              rows={2}
              onChange={(value) => updateProduct(productIndex, { description: value })}
            />

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12.5px] font-semibold text-ink-soft">
                  Entitlements
                </span>
                <button
                  type="button"
                  data-press
                  disabled={disabled || pending}
                  onClick={() =>
                    updateProduct(productIndex, {
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
                  Add entitlement
                </button>
              </div>

              {product.entitlements.map((entitlement, entitlementIndex) => (
                <div
                  key={`${entitlement.key}-${entitlementIndex}`}
                  className="grid gap-3 rounded-lg border border-border bg-surface-muted p-3 md:grid-cols-[1fr_1fr_1fr_0.7fr_auto]"
                >
                  <SettingsInput
                    id={`billing-entitlement-key-${productIndex}-${entitlementIndex}`}
                    label="Key"
                    value={entitlement.key}
                    disabled={disabled || pending}
                    onChange={(value) =>
                      updateEntitlement(productIndex, entitlementIndex, { key: value })
                    }
                  />
                  <label className="grid gap-1.5">
                    <span className="text-[12.5px] font-medium text-ink-soft">Grant</span>
                    <select
                      value={entitlement.grantType}
                      disabled={disabled || pending}
                      onChange={(event) =>
                        updateEntitlement(productIndex, entitlementIndex, {
                          grantType: event.currentTarget.value as BillingEntitlement["grantType"]
                        })
                      }
                      className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-[14px] text-ink outline-none transition-[border-color,box-shadow,background-color] focus:border-border-strong focus:shadow-[0_0_0_3px_var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {grantTypes.map((type) => (
                        <option key={type} value={type}>
                          {type.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[12.5px] font-medium text-ink-soft">Reset</span>
                    <select
                      value={entitlement.resetPeriod}
                      disabled={disabled || pending}
                      onChange={(event) =>
                        updateEntitlement(productIndex, entitlementIndex, {
                          resetPeriod: event.currentTarget.value as BillingEntitlement["resetPeriod"]
                        })
                      }
                      className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-[14px] text-ink outline-none transition-[border-color,box-shadow,background-color] focus:border-border-strong focus:shadow-[0_0_0_3px_var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {resetPeriods.map((period) => (
                        <option key={period} value={period}>
                          {period}
                        </option>
                      ))}
                    </select>
                  </label>
                  <SettingsInput
                    id={`billing-entitlement-amount-${productIndex}-${entitlementIndex}`}
                    label="Amount"
                    value={entitlement.amount === null ? "" : String(entitlement.amount)}
                    disabled={disabled || pending}
                    onChange={(value) =>
                      updateEntitlement(productIndex, entitlementIndex, {
                        amount: value.trim() ? Number(value) : null
                      })
                    }
                  />
                  <button
                    type="button"
                    data-press
                    disabled={disabled || pending}
                    onClick={() =>
                      updateProduct(productIndex, {
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
        ))}
      </div>

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

function settingsToForm(settings: BillingSettings) {
  return {
    provider: settings.provider,
    enabled: settings.enabled && settings.provider === "polar",
    environment: settings.environment,
    organizationId: settings.organizationId,
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
    type: "subscription",
    priceAmount: 500,
    priceCurrency: "usd",
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
