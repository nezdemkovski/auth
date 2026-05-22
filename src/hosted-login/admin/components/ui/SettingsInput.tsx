import { Input, Label, TextField } from "react-aria-components";

export function SettingsInput({
  id,
  label,
  value,
  disabled = false,
  placeholder,
  type = "text",
  autoComplete,
  onChange
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextField
      id={id}
      value={value}
      isDisabled={disabled}
      type={type}
      autoComplete={autoComplete}
      onChange={onChange}
      className="flex flex-col"
    >
      <Label className="mb-1.5 block text-[12.5px] font-medium tracking-[-0.005em] text-ink-soft">
        {label}
      </Label>
      <Input
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-[14px] text-ink outline-none placeholder:text-muted-soft transition-[border-color,box-shadow,background-color] duration-150 data-[focused]:border-border-strong data-[focused]:shadow-[0_0_0_3px_var(--focus-ring)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60"
      />
    </TextField>
  );
}
