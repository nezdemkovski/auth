export function SettingsTextarea({
  id,
  label,
  value,
  disabled = false,
  placeholder,
  rows,
  onChange
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  placeholder?: string;
  rows: number;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[12.5px] font-medium tracking-[-0.005em] text-ink-soft"
      >
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        rows={rows}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2.5 text-[14px] leading-5 text-ink outline-none placeholder:text-muted-soft disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          transition:
            "border-color 140ms ease, box-shadow 140ms ease, background-color 140ms ease"
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--border-strong)";
          e.currentTarget.style.boxShadow = "0 0 0 3px var(--focus-ring)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--border)";
          e.currentTarget.style.boxShadow = "none";
        }}
      />
    </div>
  );
}
