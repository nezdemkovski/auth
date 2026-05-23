import type React from "react";
import { useEffect, useState } from "react";

import type {
  BillingEntitlement,
  BillingProductMapping,
  BillingSettings,
  BillingSettingsPatch
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
  onSave,
  onVerify
}: {
  settings: BillingSettings;
  disabled: boolean;
  pending: boolean;
  verifyPending: boolean;
  error: string | null;
  onSave: (patch: BillingSettingsPatch) => void;
  onVerify: () => void;
}) {
  const [form, setForm] = useState(() => settingsToForm(settings));
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
          disabled={disabled || verifyPending || !settings.enabled || !settings.accessTokenConfigured}
          onClick={onVerify}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface-muted px-3 text-[12.5px] font-medium text-ink-soft outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {verifyPending ? "Checking…" : "Check Polar"}
        </button>
      </div>

      {localError || error ? <FormAlert>{localError ?? error}</FormAlert> : null}

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
