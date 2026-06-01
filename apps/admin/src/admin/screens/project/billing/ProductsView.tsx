import type React from "react";

import type {
  BillingEntitlement,
  BillingProductMapping,
  BillingSettings,
  CreatePolarProductInput,
  PolarProductSummary
} from "../../../types";
import { Button } from "@nezdemkovski/auth-ui";

import { CreateProductEditor, ProductEditor } from "./ProductEditors";
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
