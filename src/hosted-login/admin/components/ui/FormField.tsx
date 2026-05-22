import type { ReactNode } from "react";
import { Input, Label, TextField } from "react-aria-components";

export function FormField({
  id,
  name,
  label,
  type,
  autoComplete,
  placeholder,
  hint
}: {
  id: string;
  name: string;
  label: string;
  type: string;
  autoComplete: string;
  placeholder?: string;
  hint?: ReactNode;
}) {
  return (
    <TextField
      id={id}
      name={name}
      type={type}
      autoComplete={autoComplete}
      isRequired
      className="flex flex-col"
    >
      <div className="mb-1.5 flex items-baseline justify-between">
        <Label className="text-[12.5px] font-medium tracking-[-0.005em] text-ink-soft">
          {label}
        </Label>
        {hint}
      </div>
      <Input
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-[14px] text-ink outline-none placeholder:text-muted-soft transition-[border-color,box-shadow,background-color] duration-150 data-[focused]:border-border-strong data-[focused]:shadow-[0_0_0_3px_var(--focus-ring)] data-[invalid]:border-[var(--danger-border)] data-[invalid]:data-[focused]:shadow-[0_0_0_3px_rgba(220,38,38,0.18)]"
      />
    </TextField>
  );
}
