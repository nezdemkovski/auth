import type React from "react";

import type {
  BillingEntitlement,
  BillingProductMapping,
  BillingSettings,
  CreatePolarProductInput,
  PolarProductSummary
} from "../../../types";
import {
  Button,
  SettingsInput,
  SettingsTextarea
} from "@nezdemkovski/auth-ui";

import {
  EntitlementsEditor,
  SelectField,
  TogglePill
} from "./components";
import type { ProductWorkspace } from "./types";
import { catalogLabel } from "./utils";

export function ProductsView({
  products,
  settings,
  selectedProduct,
  workspace,
  createForm,
  polarProducts,
  mappedProductIds,
  polarProductsLoading,
  polarProductCreatePending,
  disabled,
  onWorkspaceChange,
  onCreateFormChange,
  onCreateInPolar,
  onConnectPolarProduct,
  onAddManual,
  onUpdateProduct,
  onUpdateEntitlement,
  onRemoveProduct
}: {
  products: BillingProductMapping[];
  settings: BillingSettings;
  selectedProduct: BillingProductMapping | null;
  workspace: ProductWorkspace;
  createForm: CreatePolarProductInput;
  polarProducts: PolarProductSummary[];
  mappedProductIds: Set<string>;
  polarProductsLoading: boolean;
  polarProductCreatePending: boolean;
  disabled: boolean;
  onWorkspaceChange: (workspace: ProductWorkspace) => void;
  onCreateFormChange: React.Dispatch<React.SetStateAction<CreatePolarProductInput>>;
  onCreateInPolar: () => void;
  onConnectPolarProduct: (product: PolarProductSummary) => void;
  onAddManual: () => void;
  onUpdateProduct: (index: number, patch: Partial<BillingProductMapping>) => void;
  onUpdateEntitlement: (
    productIndex: number,
    entitlementIndex: number,
    patch: Partial<BillingEntitlement>
  ) => void;
  onRemoveProduct: (index: number) => void;
}) {
  return (
    <div className="mt-5 grid gap-5 xl:grid-cols-[340px_1fr]">
      <aside className="space-y-3">
        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-[13px] font-semibold text-ink">Products</span>
            <Button
              type="button"
              disabled={disabled}
              onClick={() => onWorkspaceChange({ mode: "create" })}
              variant="primary"
              size="sm"
            >
              New
            </Button>
          </div>

          {products.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface-muted px-3 py-3 text-[12.5px] leading-5 text-muted">
              Create or import a product to make checkout available.
            </div>
          ) : (
            <div className="space-y-2">
              {products.map((product, index) => (
                <button
                  key={`${product.slug}-${index}`}
                  type="button"
                  onClick={() => onWorkspaceChange({ mode: "product", index })}
                  className={`w-full rounded-lg border px-3 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                    workspace.mode === "product" && workspace.index === index
                      ? "border-border-strong bg-accent-soft"
                      : "border-border bg-surface-muted hover:bg-surface-hover"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-[13px] font-semibold text-ink">
                      {product.name || product.slug || "Untitled product"}
                    </span>
                    <span
                      className={`h-2 w-2 rounded-full ${
                        product.active ? "bg-success" : "bg-muted-soft"
                      }`}
                    />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-[11.5px] text-muted">
                    <code className="font-mono">{product.slug || "no-slug"}</code>
                    <span>·</span>
                    <span>{catalogLabel(settings.catalog.productTypes, product.type)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-[13px] font-semibold text-ink">Polar products</span>
            {polarProductsLoading ? (
              <span className="text-[11.5px] text-muted">Loading…</span>
            ) : null}
          </div>
          {polarProducts.length === 0 ? (
            <p className="rounded-lg border border-border bg-surface-muted px-3 py-3 text-[12px] leading-5 text-muted">
              Products appear here automatically after Polar is connected.
            </p>
          ) : (
            <div className="space-y-2">
              {polarProducts.map((product) => {
                const mapped = mappedProductIds.has(product.id);
                return (
                  <div
                    key={product.id}
                    className="rounded-lg border border-border bg-surface-muted px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[12.5px] font-semibold text-ink">
                          {product.name}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted">
                          <span>{product.isRecurring ? "Subscription" : "One-time"}</span>
                          <span>·</span>
                          <code className="truncate font-mono">{product.id}</code>
                        </div>
                      </div>
                      {mapped ? (
                        <span className="rounded-full border border-success-border bg-success-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-success">
                          Mapped
                        </span>
                      ) : (
                        <button
                          type="button"
                          data-press
                          disabled={disabled}
                          onClick={() => onConnectPolarProduct(product)}
                          className="inline-flex h-7 items-center justify-center rounded-md border border-border bg-surface px-2 text-[11.5px] font-medium text-ink-soft outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-55"
                        >
                          Connect
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      <main className="min-w-0 rounded-xl border border-border bg-surface p-4">
        {workspace.mode === "create" ? (
          <CreateProductEditor
            createForm={createForm}
            settings={settings}
            disabled={disabled}
            pending={polarProductCreatePending}
            onCreateFormChange={onCreateFormChange}
            onCreateInPolar={onCreateInPolar}
            onAddManual={onAddManual}
          />
        ) : selectedProduct ? (
          <ProductEditor
            product={selectedProduct}
            settings={settings}
            productIndex={workspace.index}
            disabled={disabled}
            onUpdateProduct={onUpdateProduct}
            onUpdateEntitlement={onUpdateEntitlement}
            onRemoveProduct={onRemoveProduct}
          />
        ) : (
          <div className="py-12 text-center text-[13px] text-muted">
            Select a product or create a new one.
          </div>
        )}
      </main>
    </div>
  );
}

function CreateProductEditor({
  createForm,
  settings,
  disabled,
  pending,
  onCreateFormChange,
  onCreateInPolar,
  onAddManual
}: {
  createForm: CreatePolarProductInput;
  settings: BillingSettings;
  disabled: boolean;
  pending: boolean;
  onCreateFormChange: React.Dispatch<React.SetStateAction<CreatePolarProductInput>>;
  onCreateInPolar: () => void;
  onAddManual: () => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow">New product</div>
          <h3 className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-ink">
            Create in Polar and map it here.
          </h3>
          <p className="mt-1 max-w-[34rem] text-[12.5px] leading-5 text-muted">
            Use this for normal products. Manual products are only for advanced
            cases where the Polar product already exists but cannot be loaded.
          </p>
        </div>
        <Button
          type="button"
          disabled={disabled}
          onClick={onAddManual}
          size="sm"
        >
          Add manual mapping
        </Button>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <SettingsInput
          id="polar-create-name"
          label="Name"
          value={createForm.name}
          disabled={disabled || pending}
          onChange={(value) =>
            onCreateFormChange((current) => ({
              ...current,
              name: value
            }))
          }
        />
        <SettingsInput
          id="polar-create-slug"
          label="Slug"
          value={createForm.slug}
          disabled={disabled || pending}
          onChange={(value) =>
            onCreateFormChange((current) => ({ ...current, slug: value }))
          }
        />
        <SelectField
          label="Type"
          value={createForm.type}
          disabled={disabled || pending}
          onChange={(value) =>
            onCreateFormChange((current) => ({
              ...current,
              type: value as CreatePolarProductInput["type"]
            }))
          }
          options={settings.catalog.productTypes.filter(
            (option) => option.value !== "metered"
          )}
        />
        <SelectField
          label="Billing interval"
          value={createForm.recurringInterval}
          disabled={disabled || pending || createForm.type !== "subscription"}
          onChange={(value) =>
            onCreateFormChange((current) => ({
              ...current,
              recurringInterval: value as CreatePolarProductInput["recurringInterval"]
            }))
          }
          options={settings.catalog.recurringIntervals}
        />
        <SettingsInput
          id="polar-create-price"
          label="Price in minor units"
          value={String(createForm.priceAmount)}
          disabled={disabled || pending}
          onChange={(value) =>
            onCreateFormChange((current) => ({
              ...current,
              priceAmount: Number(value)
            }))
          }
        />
        <SettingsInput
          id="polar-create-currency"
          label="Currency"
          value={createForm.priceCurrency}
          disabled={disabled || pending}
          onChange={(value) =>
            onCreateFormChange((current) => ({ ...current, priceCurrency: value }))
          }
        />
      </div>

      <div className="mt-4">
        <SettingsTextarea
          id="polar-create-description"
          label="Description"
          value={createForm.description}
          disabled={disabled || pending}
          rows={3}
          onChange={(value) =>
            onCreateFormChange((current) => ({ ...current, description: value }))
          }
        />
      </div>

      <div className="mt-5 flex justify-end">
        <Button
          type="button"
          disabled={disabled || pending}
          onClick={onCreateInPolar}
          loading={pending}
          variant="primary"
          size="sm"
          className="px-4"
        >
          {pending ? "Creating…" : "Create and map"}
        </Button>
      </div>
    </div>
  );
}

function ProductEditor({
  product,
  settings,
  productIndex,
  disabled,
  onUpdateProduct,
  onUpdateEntitlement,
  onRemoveProduct
}: {
  product: BillingProductMapping;
  settings: BillingSettings;
  productIndex: number;
  disabled: boolean;
  onUpdateProduct: (index: number, patch: Partial<BillingProductMapping>) => void;
  onUpdateEntitlement: (
    productIndex: number,
    entitlementIndex: number,
    patch: Partial<BillingEntitlement>
  ) => void;
  onRemoveProduct: (index: number) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow">Product contract</div>
          <h3 className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-ink">
            {product.name || product.slug || "Untitled product"}
          </h3>
          <p className="mt-1 max-w-[34rem] text-[12.5px] leading-5 text-muted">
            Keep the public slug stable. Apps should depend on this slug, not on
            Polar internals.
          </p>
        </div>
        <TogglePill
          checked={product.active}
          disabled={disabled}
          onChange={(checked) => onUpdateProduct(productIndex, { active: checked })}
        />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
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
          options={settings.catalog.productTypes}
        />
      </div>

      <div className="mt-4">
        <SettingsTextarea
          id={`billing-product-description-${productIndex}`}
          label="Checkout description"
          value={product.description}
          disabled={disabled}
          rows={3}
          onChange={(value) => onUpdateProduct(productIndex, { description: value })}
        />
      </div>

      <BenefitsEditor
        product={product}
        settings={settings}
        productIndex={productIndex}
        disabled={disabled}
        onUpdateProduct={onUpdateProduct}
        onUpdateEntitlement={onUpdateEntitlement}
      />

      <div className="mt-5 flex justify-between">
        <Button
          type="button"
          disabled={disabled}
          onClick={() => onRemoveProduct(productIndex)}
          variant="danger"
          size="sm"
        >
          Remove product
        </Button>
      </div>
    </div>
  );
}

function BenefitsEditor({
  product,
  settings,
  productIndex,
  disabled,
  onUpdateProduct,
  onUpdateEntitlement
}: {
  product: BillingProductMapping;
  settings: BillingSettings;
  productIndex: number;
  disabled: boolean;
  onUpdateProduct: (index: number, patch: Partial<BillingProductMapping>) => void;
  onUpdateEntitlement: (
    productIndex: number,
    entitlementIndex: number,
    patch: Partial<BillingEntitlement>
  ) => void;
}) {
  return (
    <div className="mt-5">
      <EntitlementsEditor
        title="Benefits"
        description="Benefits are what your app checks after checkout succeeds."
        entitlements={product.entitlements}
        idPrefix={`billing-entitlement-${productIndex}`}
        disabled={disabled}
        onAdd={() =>
          onUpdateProduct(productIndex, {
            entitlements: [...product.entitlements, settings.templates.entitlement]
          })
        }
        grantTypeOptions={settings.catalog.grantTypes}
        resetPeriodOptions={settings.catalog.resetPeriods}
        onUpdate={(entitlementIndex, patch) =>
          onUpdateEntitlement(productIndex, entitlementIndex, patch)
        }
        onRemove={(entitlementIndex) =>
          onUpdateProduct(productIndex, {
            entitlements: product.entitlements.filter(
              (_item, currentIndex) => currentIndex !== entitlementIndex
            )
          })
        }
      />
    </div>
  );
}
