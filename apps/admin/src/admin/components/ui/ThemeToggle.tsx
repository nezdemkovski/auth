import { Button } from "react-aria-components";

import { MoonIcon, SunIcon } from "@nezdemkovski/auth-client-shared/icons";
import type { Theme } from "@nezdemkovski/auth-client-shared/theme";

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
  void compact;
  return (
    <Button
      onPress={onToggle}
      aria-label={`Switch to ${next} mode`}
      className="relative grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface text-ink-soft outline-none transition-colors hover:bg-surface-hover data-[focus-visible]:ring-2 data-[focus-visible]:ring-[var(--focus-ring)] data-[pressed]:scale-[0.97]"
    >
      <span
        className="absolute inset-0 grid place-items-center transition-[opacity,transform] duration-200"
        style={{
          opacity: theme === "dark" ? 1 : 0,
          transform: theme === "dark" ? "scale(1)" : "scale(0.6)"
        }}
      >
        <MoonIcon size={15} />
      </span>
      <span
        className="absolute inset-0 grid place-items-center transition-[opacity,transform] duration-200"
        style={{
          opacity: theme === "light" ? 1 : 0,
          transform: theme === "light" ? "scale(1)" : "scale(0.6)"
        }}
      >
        <SunIcon size={15} />
      </span>
    </Button>
  );
}
