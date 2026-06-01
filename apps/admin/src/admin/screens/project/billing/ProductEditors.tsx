import type React from "react";

import { Button, SettingsInput, SettingsTextarea } from "@nezdemkovski/auth-ui";

import type {
  BillingEntitlement,
  BillingProductMapping,
  BillingSettings,
  CreatePolarProductInput
} from "../../../types";
import { EntitlementsEditor, SelectField, TogglePill } from "./components";

export function CreateProductEditor({
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
        <Button type="button" disabled={disabled} onClick={onAddManual} size="sm">
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

export function ProductEditor({
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
