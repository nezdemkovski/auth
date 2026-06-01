import { cn } from "./cn";

const TRACK_STATES = {
  on: "bg-accent",
  off: "bg-surface-muted"
};

const THUMB_STATES = {
  on: "translate-x-4 bg-accent-ink",
  off: "bg-muted-soft"
};

const DISABLED_CLASS = {
  true: "cursor-not-allowed opacity-55",
  false: ""
};

export function Switch({
  checked,
  disabled = false,
  onChange
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const state = checked ? "on" : "off";
  const disabledKey = disabled ? "true" : "false";

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
        className={cn(
          "relative h-6 w-10 rounded-full border border-border transition-colors",
          TRACK_STATES[state],
          DISABLED_CLASS[disabledKey]
        )}
      >
        <span
          className={cn(
            "absolute left-1 top-1 h-4 w-4 rounded-full transition-transform",
            THUMB_STATES[state]
          )}
        />
      </span>
      {checked ? "On" : "Off"}
    </span>
  );
}
