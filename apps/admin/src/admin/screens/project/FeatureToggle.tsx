import { Switch } from "@nezdemkovski/auth-ui";

export function FeatureToggle({
  label,
  description,
  checked,
  disabled,
  inset = false,
  onChange
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  inset?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border border-border bg-surface px-3 py-3 ${
        inset ? "ml-8" : ""
      }`}
    >
      <Switch checked={checked} disabled={disabled} onChange={onChange} />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        <span className="mt-0.5 block text-[12px] leading-5 text-muted">{description}</span>
      </span>
    </label>
  );
}
