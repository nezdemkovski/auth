import { cn } from "./cn";

export type SelectOption = {
  value: string;
  label: string;
};

export function SelectField({
  id,
  label,
  value,
  disabled = false,
  options,
  className,
  onChange
}: {
  id?: string;
  label: string;
  value: string;
  disabled?: boolean;
  options: SelectOption[];
  className?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={cn("grid gap-1.5", className)}>
      <span className="text-[12.5px] font-medium text-ink-soft">{label}</span>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-[14px] text-ink outline-none transition-[border-color,box-shadow,background-color] focus:border-border-strong focus:shadow-[0_0_0_3px_var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
