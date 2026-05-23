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

type BillingView = "setup" | "products";
type ProductWorkspace =
  | { mode: "product"; index: number }
  | { mode: "create" };

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
  const [view, setView] = useState<BillingView>("setup");
  const [workspace, setWorkspace] = useState<ProductWorkspace>(() => ({
    mode: settings.products.length > 0 ? "product" : "create",
    index: 0
  }));
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setForm(settingsToForm(settings));
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
    const nextProduct = product ?? defaultProduct();
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

  function importPolarProduct(product: PolarProductSummary) {
    if (form.products.some((mapping) => mapping.productId === product.id)) {
      setLocalError("This Polar product is already mapped.");
      return;
    }

    setLocalError(null);
    addProduct(productFromPolar(product));
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
    addProduct(product);
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
          onUpdate={update}
          onVerify={onVerify}
        />
      ) : (
        <ProductsView
          products={form.products}
          selectedProduct={selectedProduct}
          workspace={workspace}
          createForm={createForm}
          polarProducts={polarProducts}
          mappedProductIds={new Set(form.products.map((product) => product.productId))}
          polarProductsLoading={polarProductsLoading}
          polarProductCreatePending={polarProductCreatePending}
          disabled={disabled || pending}
          canLoadPolar={settings.enabled && settings.accessTokenConfigured}
          onWorkspaceChange={setWorkspace}
          onCreateFormChange={setCreateForm}
          onLoadPolar={onRefreshPolarProducts}
          onCreateInPolar={createInPolar}
          onImportPolarProduct={importPolarProduct}
          onAddManual={() => addProduct()}
          onUpdateProduct={updateProduct}
          onUpdateEntitlement={updateEntitlement}
          onRemoveProduct={removeProduct}
        />
      )}
    </form>
  );
}

function SetupView({
  settings,
  form,
  disabled,
  pending,
  verifyPending,
  onUpdate,
  onVerify
}: {
  settings: BillingSettings;
  form: ReturnType<typeof settingsToForm>;
  disabled: boolean;
  pending: boolean;
  verifyPending: boolean;
  onUpdate: <K extends keyof ReturnType<typeof settingsToForm>>(
    key: K,
    value: ReturnType<typeof settingsToForm>[K]
  ) => void;
  onVerify: (input: {
    accessToken?: string;
    environment?: BillingSettings["environment"];
  }) => void;
}) {
  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="rounded-xl border border-border bg-surface-muted p-4">
        <div className="eyebrow">Connection</div>
        <h3 className="mt-3 text-[20px] font-semibold tracking-[-0.02em] text-ink">
          Polar handles checkout. Auth stores the contract.
        </h3>
        <p className="mt-2 text-[12.5px] leading-5 text-muted">
          Keep credentials here, then use the product slug from your app. Products
          and entitlements stay in auth so application code only asks for a known
          contract.
        </p>
        <div className="mt-4 space-y-2 text-[12.5px] text-muted">
          <KeyValue label="Webhook" value={settings.webhookUrl || "Not generated"} />
          <KeyValue label="Environment" value={form.environment} />
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-surface p-4">
        <ToggleRow
          label="Enable billing"
          description="Expose checkout, customer portal, usage meter, and webhook endpoints for this realm."
          checked={form.enabled}
          disabled={disabled || pending}
          onChange={(checked) => onUpdate("enabled", checked)}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <SelectField
            label="Environment"
            value={form.environment}
            disabled={disabled || pending}
            onChange={(value) =>
              onUpdate("environment", value as BillingSettings["environment"])
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
            onChange={(value) => onUpdate("accessToken", value)}
          />
          <SettingsInput
            id="polar-webhook-secret"
            label="Webhook secret"
            value={form.webhookSecret}
            type="password"
            disabled={disabled || pending}
            placeholder={settings.webhookSecretConfigured ? "Stored encrypted" : "Optional"}
            onChange={(value) => onUpdate("webhookSecret", value)}
          />
          <div className="flex items-end">
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
              className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-border bg-surface-muted px-3 text-[12.5px] font-medium text-ink-soft outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {verifyPending ? "Checking…" : "Check connection"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductsView({
  products,
  selectedProduct,
  workspace,
  createForm,
  polarProducts,
  mappedProductIds,
  polarProductsLoading,
  polarProductCreatePending,
  disabled,
  canLoadPolar,
  onWorkspaceChange,
  onCreateFormChange,
  onLoadPolar,
  onCreateInPolar,
  onImportPolarProduct,
  onAddManual,
  onUpdateProduct,
  onUpdateEntitlement,
  onRemoveProduct
}: {
  products: BillingProductMapping[];
  selectedProduct: BillingProductMapping | null;
  workspace: ProductWorkspace;
  createForm: CreatePolarProductInput;
  polarProducts: PolarProductSummary[];
  mappedProductIds: Set<string>;
  polarProductsLoading: boolean;
  polarProductCreatePending: boolean;
  disabled: boolean;
  canLoadPolar: boolean;
  onWorkspaceChange: (workspace: ProductWorkspace) => void;
  onCreateFormChange: React.Dispatch<React.SetStateAction<CreatePolarProductInput>>;
  onLoadPolar: () => void;
  onCreateInPolar: () => void;
  onImportPolarProduct: (product: PolarProductSummary) => void;
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
            <button
              type="button"
              data-press
              disabled={disabled}
              onClick={() => onWorkspaceChange({ mode: "create" })}
              className="inline-flex h-8 items-center justify-center rounded-md bg-accent px-2.5 text-[12px] font-medium text-accent-ink outline-none transition-colors hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-55"
            >
              New
            </button>
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
                    <span>{productTypeLabels[product.type]}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-[13px] font-semibold text-ink">Polar catalog</span>
            <button
              type="button"
              data-press
              disabled={disabled || polarProductsLoading || !canLoadPolar}
              onClick={onLoadPolar}
              className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-surface-muted px-2.5 text-[12px] font-medium text-ink-soft outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {polarProductsLoading ? "Loading…" : "Load"}
            </button>
          </div>
          <div className="space-y-2">
            {polarProducts.length === 0 ? (
              <p className="rounded-lg border border-border bg-surface-muted px-3 py-3 text-[12px] leading-5 text-muted">
                Load products to import existing Polar catalog items.
              </p>
            ) : (
              polarProducts.map((product) => {
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
                          onClick={() => onImportPolarProduct(product)}
                          className="inline-flex h-7 items-center justify-center rounded-md border border-border bg-surface px-2 text-[11.5px] font-medium text-ink-soft outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-55"
                        >
                          Import
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </aside>

      <main className="min-w-0 rounded-xl border border-border bg-surface p-4">
        {workspace.mode === "create" ? (
          <CreateProductEditor
            createForm={createForm}
            disabled={disabled}
            pending={polarProductCreatePending}
            onCreateFormChange={onCreateFormChange}
            onCreateInPolar={onCreateInPolar}
            onAddManual={onAddManual}
          />
        ) : selectedProduct ? (
          <ProductEditor
            product={selectedProduct}
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
  disabled,
  pending,
  onCreateFormChange,
  onCreateInPolar,
  onAddManual
}: {
  createForm: CreatePolarProductInput;
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
        <button
          type="button"
          data-press
          disabled={disabled}
          onClick={onAddManual}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface-muted px-3 text-[12.5px] font-medium text-ink-soft outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-55"
        >
          Add manual mapping
        </button>
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
              name: value,
              slug: current.slug || slugFromName(value)
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
          disabled={disabled || pending || createForm.type !== "subscription"}
          onChange={(value) =>
            onCreateFormChange((current) => ({
              ...current,
              recurringInterval: value as CreatePolarProductInput["recurringInterval"]
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
        <button
          type="button"
          data-press
          disabled={disabled || pending}
          onClick={onCreateInPolar}
          className="inline-flex h-9 items-center justify-center rounded-lg bg-accent px-4 text-[13px] font-medium text-accent-ink outline-none transition-colors hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-55"
          style={{ boxShadow: "var(--shadow-button)" }}
        >
          {pending ? "Creating…" : "Create and map"}
        </button>
      </div>
    </div>
  );
}

function ProductEditor({
  product,
  productIndex,
  disabled,
  onUpdateProduct,
  onUpdateEntitlement,
  onRemoveProduct
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
          options={productTypes.map((type) => [type, productTypeLabels[type]])}
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
        productIndex={productIndex}
        disabled={disabled}
        onUpdateProduct={onUpdateProduct}
        onUpdateEntitlement={onUpdateEntitlement}
      />

      <div className="mt-5 flex justify-between">
        <button
          type="button"
          data-press
          disabled={disabled}
          onClick={() => onRemoveProduct(productIndex)}
          className="text-[12.5px] font-medium text-muted underline-offset-[3px] hover:text-danger hover:underline disabled:cursor-not-allowed disabled:opacity-55"
        >
          Remove product
        </button>
      </div>
    </div>
  );
}

function BenefitsEditor({
  product,
  productIndex,
  disabled,
  onUpdateProduct,
  onUpdateEntitlement
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
}) {
  return (
    <section className="mt-5 rounded-xl border border-border bg-surface-muted p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-[13.5px] font-semibold text-ink">Benefits</h4>
          <p className="mt-1 text-[12px] leading-5 text-muted">
            Benefits are what your app checks after checkout succeeds.
          </p>
        </div>
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
          className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-surface px-2.5 text-[12px] font-medium text-ink-soft outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-55"
        >
          Add benefit
        </button>
      </div>

      <div className="mt-4 grid gap-3">
        {product.entitlements.map((entitlement, entitlementIndex) => (
          <div
            key={`${entitlement.key}-${entitlementIndex}`}
            className="rounded-lg border border-border bg-surface p-3"
          >
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_0.7fr_auto]">
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
          </div>
        ))}
      </div>
    </section>
  );
}

function SegmentedControl({
  value,
  options,
  onChange
}: {
  value: BillingView;
  options: Array<readonly [BillingView, string]>;
  onChange: (value: BillingView) => void;
}) {
  return (
    <div className="mt-5 inline-flex rounded-xl border border-border bg-surface-muted p-1">
      {options.map(([optionValue, label]) => (
        <button
          key={optionValue}
          type="button"
          onClick={() => onChange(optionValue)}
          className={`h-8 rounded-lg px-3 text-[12.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
            value === optionValue
              ? "bg-surface text-ink shadow-sm"
              : "text-muted hover:text-ink"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function StatusTile({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "neutral";
}) {
  const toneClass =
    tone === "success"
      ? "border-success-border bg-success-bg text-success"
      : tone === "warning"
        ? "border-warning-border bg-warning-bg text-warning"
        : "border-border bg-surface-muted text-muted";

  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
        {label}
      </div>
      <div
        className={`mt-2 inline-flex rounded-full border px-2 py-1 text-[12px] font-semibold ${toneClass}`}
      >
        {value}
      </div>
    </div>
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
    <label className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface-muted px-3 py-3">
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

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft">
        {label}
      </span>
      <span className="break-all font-mono text-[11.5px] text-ink-soft">{value}</span>
    </div>
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

function defaultProduct(): BillingProductMapping {
  return {
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
  };
}

function productFromPolar(product: PolarProductSummary): BillingProductMapping {
  return {
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
