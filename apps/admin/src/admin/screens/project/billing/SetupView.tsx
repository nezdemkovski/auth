import type { BillingEntitlement, BillingSettings } from "../../../types";
import {
  Button,
  SettingsInput
} from "@nezdemkovski/auth-ui";

import {
  EntitlementsEditor,
  KeyValue,
  SelectField,
  ToggleRow
} from "./components";
import type { settingsToForm } from "./utils";

export function SetupView({
  settings,
  form,
  disabled,
  pending,
  verifyPending,
  benefitPresets,
  onUpdate,
  onVerify,
  onUpdateFreeEntitlement,
  onAddFreeEntitlement,
  onAddStarterCreditGrant,
  onRemoveFreeEntitlement
}: {
  settings: BillingSettings;
  form: ReturnType<typeof settingsToForm>;
  disabled: boolean;
  pending: boolean;
  verifyPending: boolean;
  benefitPresets: BillingEntitlement[];
  onUpdate: <K extends keyof ReturnType<typeof settingsToForm>>(
    key: K,
    value: ReturnType<typeof settingsToForm>[K]
  ) => void;
  onVerify: (input: {
    accessToken?: string;
    environment?: BillingSettings["environment"];
  }) => void;
  onUpdateFreeEntitlement: (
    entitlementIndex: number,
    patch: Partial<BillingEntitlement>
  ) => void;
  onAddFreeEntitlement: () => void;
  onAddStarterCreditGrant: () => void;
  onRemoveFreeEntitlement: (entitlementIndex: number) => void;
}) {
  const benefitKeys = benefitPresets.map((benefit) => benefit.key);

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
            options={settings.catalog.environments}
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
            <Button
              type="button"
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
              loading={verifyPending}
              fullWidth
            >
              {verifyPending ? "Checking…" : "Check connection"}
            </Button>
          </div>
        </div>
      </div>

      <div className="lg:col-span-2">
        <div className="mb-3 rounded-xl border border-border bg-surface p-4">
          <div className="eyebrow">Automatic grants</div>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-[18px] font-semibold tracking-[-0.02em] text-ink">
                Configure grants issued by the auth service.
              </h3>
              <p className="mt-1 max-w-[44rem] text-[12.5px] leading-5 text-muted">
                Use the same benefit keys as your products, or enter a custom key.
                Amounts stay editable, so this does not assume a fixed value.
              </p>
              {benefitKeys.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {benefitKeys.map((key) => (
                    <span
                      key={key}
                      className="rounded-full border border-border bg-surface-muted px-2 py-1 font-mono text-[11px] text-ink-soft"
                    >
                      {key}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-[12px] leading-5 text-muted-soft">
                  Add product benefits first to reuse their keys and grant types here.
                </p>
              )}
            </div>
            <Button
              type="button"
              disabled={disabled || pending}
              onClick={onAddStarterCreditGrant}
              size="sm"
            >
              {benefitKeys.length > 0
                ? `Add ${benefitKeys[0]} grant`
                : "Add grant"}
            </Button>
          </div>
        </div>
        <EntitlementsEditor
          title="Automatic grants"
          description="Optional grants managed by auth. Pick a product benefit key when possible, then set the amount and behavior explicitly."
          entitlements={form.freeEntitlements}
          idPrefix="billing-default-entitlement"
          disabled={disabled || pending}
          addLabel="Add grant"
          emptyMessage="No automatic grants configured. Access will come from checkout products only."
          keyOptions={benefitKeys}
          grantTypeOptions={settings.catalog.grantTypes}
          resetPeriodOptions={settings.catalog.resetPeriods}
          onAdd={onAddFreeEntitlement}
          onUpdate={onUpdateFreeEntitlement}
          onRemove={onRemoveFreeEntitlement}
        />
      </div>
    </div>
  );
}
