import type { ReactNode } from "react";

export function InfoPanel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-[13px] leading-5 text-muted">
      {children}
    </div>
  );
}
