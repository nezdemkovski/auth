import { Label, TextArea, TextField } from "react-aria-components";

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
    <TextField
      id={id}
      value={value}
      isDisabled={disabled}
      onChange={onChange}
      className="flex flex-col"
    >
      <Label className="mb-1.5 block text-[12.5px] font-medium tracking-[-0.005em] text-ink-soft">
        {label}
      </Label>
      <TextArea
        placeholder={placeholder}
        rows={rows}
        className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2.5 text-[14px] leading-5 text-ink outline-none placeholder:text-muted-soft transition-[border-color,box-shadow,background-color] duration-150 data-[focused]:border-border-strong data-[focused]:shadow-[0_0_0_3px_var(--focus-ring)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60"
      />
    </TextField>
  );
}
