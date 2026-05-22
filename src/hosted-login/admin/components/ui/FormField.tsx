export function FormField({
  id,
  name,
  label,
  type,
  autoComplete,
  placeholder
}: {
  id: string;
  name: string;
  label: string;
  type: string;
  autoComplete: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[12.5px] font-medium tracking-[-0.005em] text-ink-soft"
      >
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
        className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-[14px] text-ink outline-none placeholder:text-muted-soft"
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
