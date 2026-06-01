export function Switch({
  checked,
  disabled = false,
  onChange
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-[12.5px] font-medium text-ink-soft">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="sr-only"
      />
      <span
        aria-hidden="true"
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
    </span>
  );
}
