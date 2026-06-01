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
import {
  Button,
  FormAlert
} from "@nezdemkovski/auth-ui";
import {
  SegmentedControl,
  StatusTile
} from "./billing/components";
import { ProductsView } from "./billing/ProductsView";
import { SetupView } from "./billing/SetupView";
import type { BillingView, ProductWorkspace } from "./billing/types";
import { settingsToForm } from "./billing/utils";

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
  onCreatePolarProduct: (
    input: CreatePolarProductInput
  ) => Promise<BillingProductMapping>;
}) {
  const [form, setForm] = useState(() => settingsToForm(settings));
  const [createForm, setCreateForm] = useState(() => settings.templates.createProduct);
  const [view, setView] = useState<BillingView>("setup");
  const [workspace, setWorkspace] = useState<ProductWorkspace>(() => ({
    mode: settings.products.length > 0 ? "product" : "create",
    index: 0
  }));
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setForm(settingsToForm(settings));
    setCreateForm(settings.templates.createProduct);
    setLocalError(null);
    setWorkspace((current) => {
      if (settings.products.length === 0) return { mode: "create" };
      if (current.mode !== "product") return current;
      return { mode: "product", index: Math.min(current.index, settings.products.length - 1) };
    });
  }, [settings]);

  const activeProducts = useMemo(
    () => form.products.filter((product) => product.active).length,
    [form.products]
  );
  const selectedProduct =
    workspace.mode === "product" ? form.products[workspace.index] : null;
  const mappedProductIds = useMemo(
    () =>
      new Set(
        form.products
          .map((product) => product.productId.trim())
          .filter((productId) => productId.length > 0)
      ),
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

  function addProduct(product?: BillingProductMapping) {
    const nextProduct = product ?? settings.templates.product;
    update("products", [...form.products, nextProduct]);
    setWorkspace({ mode: "product", index: form.products.length });
    setView("products");
  }

  function removeProduct(index: number) {
    const products = form.products.filter((_item, currentIndex) => currentIndex !== index);
    update("products", products);
    if (products.length === 0) {
      setWorkspace({ mode: "create" });
      return;
    }
    setWorkspace({ mode: "product", index: Math.min(index, products.length - 1) });
  }

  function connectPolarProduct(product: PolarProductSummary) {
    if (mappedProductIds.has(product.id)) return;
    addProduct(product.suggestedMapping);
  }

  async function createInPolar() {
    if (!createForm.name.trim()) {
      setLocalError("Product name is required.");
      return;
    }
    setLocalError(null);
    const product = await onCreatePolarProduct({
      ...createForm,
      slug: createForm.slug.trim(),
      name: createForm.name.trim(),
      description: createForm.description.trim(),
      priceCurrency: createForm.priceCurrency.trim().toLowerCase(),
      priceAmount: Math.round(createForm.priceAmount)
    });
    addProduct(product);
    setCreateForm(settings.templates.createProduct);
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
      freeEntitlements: form.freeEntitlements,
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
    <form onSubmit={(event) => void submit(event)} className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
            Billing
          </h2>
          <p className="mt-1 max-w-[42rem] text-[12.5px] leading-5 text-muted">
            Connect Polar, then publish product contracts your apps can use.
          </p>
        </div>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={disabled || pending}
          className="h-9 px-4 text-[13px]"
        >
          {pending ? "Saving…" : "Save billing"}
        </Button>
      </div>

      {localError || error ? (
        <div className="mt-4">
          <FormAlert>{localError ?? error}</FormAlert>
        </div>
      ) : null}
      {polarProductsError || polarProductCreateError ? (
        <div className="mt-4">
          <FormAlert>{polarProductsError ?? polarProductCreateError}</FormAlert>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <StatusTile
          label="Provider"
          value={form.enabled ? "Polar" : "Disabled"}
          tone={form.enabled ? "success" : "neutral"}
        />
        <StatusTile
          label="Connection"
          value={settings.accessTokenConfigured || form.accessToken ? "Configured" : "Missing"}
          tone={settings.accessTokenConfigured || form.accessToken ? "success" : "warning"}
        />
        <StatusTile
          label="Products"
          value={`${activeProducts}/${form.products.length} active`}
          tone={activeProducts > 0 ? "success" : "neutral"}
        />
      </div>

      <SegmentedControl
        value={view}
        onChange={setView}
        options={[
          ["setup", "Setup"],
          ["products", "Products"]
        ]}
      />

      {view === "setup" ? (
        <SetupView
          settings={settings}
          form={form}
          disabled={disabled}
          pending={pending}
          verifyPending={verifyPending}
          benefitPresets={settings.benefitPresets}
          onUpdate={update}
          onVerify={onVerify}
          onUpdateFreeEntitlement={(entitlementIndex, patch) =>
            update(
              "freeEntitlements",
              form.freeEntitlements.map((entitlement, currentIndex) =>
                currentIndex === entitlementIndex ? { ...entitlement, ...patch } : entitlement
              )
            )
          }
          onAddFreeEntitlement={() =>
            update("freeEntitlements", [
              ...form.freeEntitlements,
              settings.templates.entitlement
            ])
          }
          onAddStarterCreditGrant={() =>
            update("freeEntitlements", [
              ...form.freeEntitlements,
              { ...settings.grantTemplate }
            ])
          }
          onRemoveFreeEntitlement={(entitlementIndex) =>
            update(
              "freeEntitlements",
              form.freeEntitlements.filter(
                (_item, currentIndex) => currentIndex !== entitlementIndex
              )
            )
          }
        />
      ) : (
        <ProductsView
          products={form.products}
          settings={settings}
          selectedProduct={selectedProduct}
          workspace={workspace}
          createForm={createForm}
          polarProducts={polarProducts}
          mappedProductIds={mappedProductIds}
          polarProductsLoading={polarProductsLoading}
          polarProductCreatePending={polarProductCreatePending}
          disabled={disabled || pending}
          onWorkspaceChange={setWorkspace}
          onCreateFormChange={setCreateForm}
          onCreateInPolar={createInPolar}
          onConnectPolarProduct={connectPolarProduct}
          onAddManual={() => addProduct()}
          onUpdateProduct={updateProduct}
          onUpdateEntitlement={updateEntitlement}
          onRemoveProduct={removeProduct}
        />
      )}
    </form>
  );
}

