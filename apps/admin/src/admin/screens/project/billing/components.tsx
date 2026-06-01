import type { BillingEntitlement, BillingSettings } from "../../../types";
import {
  Button,
  cn,
  SelectField as UiSelectField,
  SettingsInput,
  TogglePill
} from "@nezdemkovski/auth-ui";

import type { BillingView } from "./types";
import { uniqueStrings } from "./utils";

const SEGMENTED_OPTION_STATES = {
  active: "bg-surface text-ink shadow-sm",
  idle: "text-muted hover:text-ink"
};

const STATUS_TILE_TONES = {
  success: "border-success-border bg-success-bg text-success",
  warning: "border-warning-border bg-warning-bg text-warning",
  neutral: "border-border bg-surface-muted text-muted"
};

export function EntitlementsEditor({
  title,
  description,
  entitlements,
  idPrefix,
  disabled,
  addLabel = "Add benefit",
  emptyMessage = "No benefits configured yet.",
  keyOptions = [],
  grantTypeOptions,
  resetPeriodOptions,
  onAdd,
  onUpdate,
  onRemove
}: {
  title: string;
  description: string;
  entitlements: BillingEntitlement[];
  idPrefix: string;
  disabled: boolean;
  addLabel?: string;
  emptyMessage?: string;
  keyOptions?: string[];
  grantTypeOptions: BillingSettings["catalog"]["grantTypes"];
  resetPeriodOptions: BillingSettings["catalog"]["resetPeriods"];
  onAdd: () => void;
  onUpdate: (entitlementIndex: number, patch: Partial<BillingEntitlement>) => void;
  onRemove: (entitlementIndex: number) => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface-muted p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-[13.5px] font-semibold text-ink">{title}</h4>
          <p className="mt-1 text-[12px] leading-5 text-muted">{description}</p>
        </div>
        <Button
          type="button"
          disabled={disabled}
          onClick={onAdd}
          size="sm"
        >
          {addLabel}
        </Button>
      </div>

      <div className="mt-4 grid gap-3">
        {entitlements.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface px-3 py-4 text-[12.5px] leading-5 text-muted">
            {emptyMessage}
          </div>
        ) : null}
        {entitlements.map((entitlement, entitlementIndex) => (
          <div
            key={`${entitlement.key}-${entitlementIndex}`}
            className="rounded-lg border border-border bg-surface p-3"
          >
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_0.7fr_auto]">
              <BenefitKeyField
                id={`${idPrefix}-key-${entitlementIndex}`}
                value={entitlement.key}
                options={keyOptions}
                disabled={disabled}
                onChange={(value) => onUpdate(entitlementIndex, { key: value })}
              />
              <SelectField
                label="Grant"
                value={entitlement.grantType}
                disabled={disabled}
                onChange={(value) =>
                  onUpdate(entitlementIndex, {
                    grantType: value as BillingEntitlement["grantType"]
                  })
                }
                options={grantTypeOptions}
              />
              <SelectField
                label="Reset"
                value={entitlement.resetPeriod}
                disabled={disabled}
                onChange={(value) =>
                  onUpdate(entitlementIndex, {
                    resetPeriod: value as BillingEntitlement["resetPeriod"]
                  })
                }
                options={resetPeriodOptions}
              />
              <SettingsInput
                id={`${idPrefix}-amount-${entitlementIndex}`}
                label="Amount"
                value={entitlement.amount === null ? "" : String(entitlement.amount)}
                disabled={disabled}
                onChange={(value) =>
                  onUpdate(entitlementIndex, {
                    amount: value.trim() ? Number(value) : null
                  })
                }
              />
              <Button
                type="button"
                disabled={disabled}
                onClick={() => onRemove(entitlementIndex)}
                variant="link"
                size="sm"
                className="self-end"
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function SegmentedControl({
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
          className={cn(
            "h-8 rounded-lg px-3 text-[12.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
            SEGMENTED_OPTION_STATES[
              value === optionValue ? "active" : "idle"
            ]
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function StatusTile({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "neutral";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
        {label}
      </div>
      <div
        className={cn(
          "mt-2 inline-flex rounded-full border px-2 py-1 text-[12px] font-semibold",
          STATUS_TILE_TONES[tone]
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function ToggleRow({
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

function BenefitKeyField({
  id,
  value,
  options,
  disabled,
  onChange
}: {
  id: string;
  value: string;
  options: string[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const values = uniqueStrings([value, ...options].filter(Boolean));
  const selectOptions = benefitKeyOptions(value, values);

  if (values.length === 0) {
    return (
      <SettingsInput
        id={id}
        label="Key"
        value={value}
        disabled={disabled}
        onChange={onChange}
      />
    );
  }

  return (
    <UiSelectField
      label="Key"
      value={value}
      disabled={disabled}
      options={selectOptions}
      onChange={onChange}
    />
  );
}

const benefitKeyOptions = (value: string, values: string[]) => {
  const placeholder = value.trim()
    ? []
    : [{ value: "", label: "Select benefit key" }];

  return [
    ...placeholder,
    ...values.map((option) => ({ value: option, label: option }))
  ];
};

export function SelectField({
  label,
  value,
  disabled,
  options,
  onChange
}: {
  label: string;
  value: string;
  disabled: boolean;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <UiSelectField
      label={label}
      value={value}
      disabled={disabled}
      options={options}
      onChange={onChange}
    />
  );
}

export function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft">
        {label}
      </span>
      <span className="break-all font-mono text-[11.5px] text-ink-soft">{value}</span>
    </div>
  );
}
