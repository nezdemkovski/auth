import { Switch } from "./Switch";

export function TogglePill({
  checked,
  disabled,
  onChange
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return <Switch checked={checked} disabled={disabled} onChange={onChange} />;
}
