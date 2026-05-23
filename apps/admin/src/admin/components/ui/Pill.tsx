import type React from "react";

export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border bg-surface-muted px-1.5 py-0.5 text-[11.5px] font-medium text-ink-soft">
      {children}
    </span>
  );
}
