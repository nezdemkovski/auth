import type React from "react";

import { BrandMark } from "../../icons";
import type { Theme } from "../../theme";
import { ThemeToggle } from "./primitives";

export function CenteredShell({
  children,
  theme,
  onToggleTheme
}: {
  children: React.ReactNode;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  return (
    <main className="relative min-h-screen">
      <div
        aria-hidden="true"
        data-grid-bg
        className="pointer-events-none absolute inset-0"
      />
      <header className="relative z-10 flex h-14 items-center justify-between px-6 lg:px-10">
        <div className="flex items-center gap-2 text-ink">
          <BrandMark size={20} />
          <span className="text-[13.5px] font-medium tracking-[-0.005em]">
            Auth Admin
          </span>
          <span aria-hidden="true" className="text-muted-soft">
            /
          </span>
          <span className="mono text-[12px] uppercase tracking-[0.06em] text-muted">
            Nezdemkovski Cloud
          </span>
        </div>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>
      <div className="relative z-10 grid min-h-[calc(100vh-3.5rem)] place-items-center px-5 py-8">
        <div className="w-full max-w-[420px]">
          <div className="enter enter-1">{children}</div>
        </div>
      </div>
    </main>
  );
}
