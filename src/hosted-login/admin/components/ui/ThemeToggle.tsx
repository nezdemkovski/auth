import { MoonIcon, SunIcon } from "../../../icons";
import type { Theme } from "../../../theme";

export function ThemeToggle({
  theme,
  onToggle,
  compact = false
}: {
  theme: Theme;
  onToggle: () => void;
  compact?: boolean;
}) {
  const next = theme === "dark" ? "light" : "dark";
  const size = compact ? "h-9 w-9" : "h-9 w-9";
  return (
    <button
      type="button"
      onClick={onToggle}
      data-press
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={`relative grid ${size} place-items-center rounded-lg border border-border bg-surface text-ink-soft outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]`}
    >
      <span
        className="absolute inset-0 grid place-items-center transition-[opacity,transform,filter] duration-200"
        style={{
          opacity: theme === "dark" ? 1 : 0,
          transform: theme === "dark" ? "scale(1)" : "scale(0.5)",
          filter: theme === "dark" ? "blur(0)" : "blur(4px)"
        }}
      >
        <MoonIcon size={15} />
      </span>
      <span
        className="absolute inset-0 grid place-items-center transition-[opacity,transform,filter] duration-200"
        style={{
          opacity: theme === "light" ? 1 : 0,
          transform: theme === "light" ? "scale(1)" : "scale(0.5)",
          filter: theme === "light" ? "blur(0)" : "blur(4px)"
        }}
      >
        <SunIcon size={15} />
      </span>
    </button>
  );
}
